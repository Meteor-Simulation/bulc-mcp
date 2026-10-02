// Test helpers: a stand-in for the BULC app bridge and an MCP client that talks to the built server.
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SERVER = path.join(ROOT, "build", "server.js");
/** Port 1 is privileged and never open — a reliable "app not running". */
export const DEAD_URL = "http://127.0.0.1:1";

const readBody = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({ _raw: b });
      }
    });
  });

/**
 * Minimal BULC bridge. `onCall(name, args)` returns { message, action?, data?, image? } (default: "applied <name>").
 * With `token`, every request except /health needs "Authorization: Bearer <token>" (like BULC_BRIDGE_AUTH=all).
 * Records every request in `requests`.
 */
export function startStubBridge({ tools, onCall, health, port = 0, token } = {}) {
  const requests = [];
  const toolList = tools ?? [
    { name: "set_mesh", description: "live set_mesh", inputSchema: { type: "object", properties: { ni: { type: "number" }, nj: { type: "number" }, nk: { type: "number" } }, required: ["ni", "nj", "nk"] } },
    { name: "validate_project", description: "live validate", inputSchema: { type: "object", properties: {} } },
    { name: "preview_fds", description: "live preview", inputSchema: { type: "object", properties: { namelist: { type: "string" }, max_lines: { type: "number" } } } },
    { name: "shape_screenshot", description: "live screenshot", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
    { name: "brand_new_tool", description: "only exists in the running app", inputSchema: { type: "object", properties: {} } },
  ];
  const server = http.createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    const entry = { method: req.method, url: req.url, headers: req.headers };
    requests.push(entry);
    if (req.method === "GET" && req.url === "/health") return res.end(JSON.stringify(health ?? { ok: true, hasProject: true, toolCount: toolList.length }));
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "unauthorized: token required" }));
    }
    if (req.method === "GET" && req.url === "/tools") return res.end(JSON.stringify({ tools: toolList }));
    const body = await readBody(req);
    entry.body = body;
    if (req.url === "/call") {
      const r = onCall ? await onCall(body.name, body.args ?? {}) : null;
      return res.end(JSON.stringify(r ?? { message: `applied ${body.name}`, action: null }));
    }
    if (req.url === "/summary") return res.end(JSON.stringify({ summary: { chid: "stub", counts: { obstacles: 3 } } }));
    if (req.url === "/run") return res.end(JSON.stringify({ ok: true, fdsPath: "D:/runs/stub/stub.fds", dir: "D:/runs/stub" }));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const p = server.address().port;
      resolve({ server, requests, port: p, url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/** A server on the bridge port that is NOT BULC (answers HTML). */
export function startForeignServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<html><body>some other app</body></html>");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const p = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/** A free TCP port (listen on 0, read it, close). */
export function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function connect(env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    // never pick up the discovery file of a BULC app that may be running on the test machine
    env: {
      ...process.env,
      BULC_BRIDGE_URL: DEAD_URL,
      BULC_BRIDGE_DISCOVERY_FILE: "0",
      BULC_BRIDGE_TOKEN: "",
      BULC_MCP_WATCH_MS: "0",
      BULC_BRIDGE_PORT: "",
      BULC_BRIDGE_HOST: "",
      ...env,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "bulc-mcp-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

export async function call(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  return { text: (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"), isError: !!r.isError, raw: r };
}
