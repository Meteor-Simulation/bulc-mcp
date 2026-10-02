#!/usr/bin/env node
/**
 * bulc-mcp — MCP server for the BULC desktop app.
 *
 * A thin client of the bridge that BULC hosts on 127.0.0.1: app tools are listed from the running
 * app (or a bundled snapshot when it is not running) and every call is executed by the app itself.
 * On top of that this server ships a knowledge pack — ontology, rules, playbooks, glossary, FDS
 * 6.10.1 key reference — as MCP resources, prompts and local tools, so client models make fewer
 * modelling mistakes. stdout carries the MCP protocol; every log line goes to stderr.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BridgeClient, BridgeError, type Probe } from "./bridge.js";
import { Catalog, loadSnapshot } from "./catalog.js";
import { LONG_RUNNING_TOOLS, loadConfig } from "./config.js";
import { buildInstructions } from "./knowledge/instructions.js";
import { getPrompt, listPrompts } from "./knowledge/prompts.js";
import { listResources, listResourceTemplates, readResource } from "./knowledge/resources.js";
import { Knowledge } from "./knowledge/store.js";
import { localDefs, localToolsFor } from "./local-tools/index.js";
import type { Ctx } from "./local-tools/types.js";
import { readPackageVersion } from "./paths.js";
import { fromAppReply, text, type ToolResult } from "./results.js";
import { closest } from "./schema-check.js";

const log = (...a: unknown[]) => console.error("[bulc-mcp]", ...a);

const VERSION = readPackageVersion();
const cfg = loadConfig();
const bridge = new BridgeClient(cfg);
const locals = localToolsFor(cfg.profile);
const localByName = new Map(locals.map((t) => [t.def.name, t]));

// The snapshot also feeds the knowledge search index with the app tools' descriptions.
const snapshot = loadSnapshot();
const knowledge = Knowledge.load(snapshot.tools.map((t) => ({ name: t.name, description: t.description, category: t.category })));
const catalog = new Catalog(cfg, bridge, knowledge, () => localDefs(cfg.profile), snapshot);

async function forward(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (cfg.hideTools.has(name)) return text(`'${name}' 은 이 서버 설정(BULC_MCP_HIDE_TOOLS)으로 숨겨져 있습니다 / hidden by BULC_MCP_HIDE_TOOLS.`, true);
  const known = await catalog.findAppTool(name);
  if (!known && catalog.lastProbe?.state !== "connected") {
    const near = closest(name, [...catalog.snapshot.tools.map((t) => t.name), ...locals.map((t) => t.def.name)], 3);
    return text(
      `Unknown tool: ${name}${near.length ? ` — did you mean ${near.join(", ")}?` : ""}\n` +
        "[bulc-mcp] 이런 도구는 없습니다. bulc_find_tools 로 실제 도구를 찾으세요(GEN-005). / No such tool; find the real one with bulc_find_tools (GEN-005).",
      true,
    );
  }
  try {
    const timeout = LONG_RUNNING_TOOLS.has(name) ? cfg.longCallTimeoutMs : cfg.callTimeoutMs;
    const reply = await bridge.callTool(name, args, timeout);
    return fromAppReply(name, reply, { attachImages: cfg.attachImages });
  } catch (err) {
    if (err instanceof BridgeError) return text(err.message, true);
    return text(`Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

const ctx: Ctx = { cfg, bridge, catalog, knowledge, version: VERSION, forward };

const server = new Server(
  { name: "bulc-mcp", title: "BULC", version: VERSION, websiteUrl: "https://github.com/Meteor-Simulation/bulc-mcp" },
  {
    capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
    instructions: buildInstructions(knowledge.rules.length),
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const { tools, live, appToolCount } = await catalog.list();
  log(`tools/list → ${tools.length} tools (${live ? `live from BULC, ${appToolCount} app tools` : `bundled snapshot of ${appToolCount} — BULC not connected`}, profile ${cfg.profile})`);
  return {
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema as { type: "object" }, annotations: t.annotations })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    const local = localByName.get(name);
    if (local && !cfg.hideTools.has(name)) return await local.run(args, ctx);
    return await forward(name, args);
  } catch (err) {
    if (err instanceof BridgeError) return text(err.message, true);
    return text(`Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`, true);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listResources(knowledge) }));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: listResourceTemplates() }));
server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
  contents: [await readResource(request.params.uri, knowledge, catalog, bridge)],
}));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: listPrompts(knowledge) }));
server.setRequestHandler(GetPromptRequestSchema, async (request) => getPrompt(knowledge, request.params.name, (request.params.arguments ?? {}) as Record<string, string>));

/** Connection signature: changes when the app appears, disappears, moves to another port or changes its tool set. */
const signature = (p: Probe): string =>
  p.state === "connected" ? `connected:${p.url}:${p.health?.toolsHash ?? p.health?.toolCount ?? "?"}` : p.state;

/** Watch the bridge and tell the client when the app appears, disappears or changes its tool set. */
function startWatch(initial: string): void {
  if (!cfg.watchMs) return;
  let last = initial;
  const tick = async () => {
    const p = await bridge.probe();
    const sig = signature(p);
    if (sig !== last) {
      log(`bridge state ${last} → ${sig}; sending tools/list_changed`);
      catalog.invalidate();
      last = sig;
      server.sendToolListChanged().catch(() => undefined);
    }
    timer = setTimeout(tick, p.state === "connected" ? cfg.watchConnectedMs : cfg.watchMs);
    timer.unref?.();
  };
  let timer = setTimeout(tick, cfg.watchMs);
  timer.unref?.();
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const p = await bridge.probe();
  log(`v${VERSION} · bridge ${p.url}${p.source ? ` (${p.source})` : ""} · profile ${cfg.profile} · knowledge ${knowledge.rules.length} rules`);
  if (p.state === "connected") {
    log(`BULC connected — ${p.health?.toolCount ?? "?"} app tools${p.health?.appVersion ? `, app ${p.health.appVersion}` : ""}`);
    if (p.health?.toolsHash && catalog.snapshot.toolsHash && p.health.toolsHash !== catalog.snapshot.toolsHash)
      log(`the app's tool set differs from the bundled snapshot (${p.health.toolsHash} vs ${catalog.snapshot.toolsHash}) — the live list is used`);
  } else if (p.state === "not_bulc") log(`a non-BULC program answers at ${p.url} — check BULC_BRIDGE_URL / BULC_BRIDGE_PORT`);
  else if (p.state === "remote_blocked") log(`bridge host is not loopback — set BULC_MCP_ALLOW_REMOTE=1 to allow`);
  else log(`BULC not connected — listing the bundled snapshot (${catalog.snapshot.toolCount} tools); calls work once the app runs`);
  startWatch(signature(p));
}

main().catch((err) => {
  log("failed to start:", err);
  process.exit(1);
});
