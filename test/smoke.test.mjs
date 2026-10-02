// End-to-end: the built server against no app, a stub BULC bridge, a late-starting app and a foreign server.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { ROOT, call, connect, freePort, startForeignServer, startStubBridge } from "./helpers.mjs";

describe("(a) BULC not running — snapshot fallback", () => {
  let client;
  before(async () => (client = await connect()));
  after(async () => client?.close());

  test("lists the bundled snapshot plus local tools", async () => {
    const { tools } = await client.listTools();
    assert.ok(tools.length > 200, `got ${tools.length} tools`);
    for (const n of ["set_mesh", "auto_multimesh", "preview_fds", "validate_project", "add_fire", "evac_add_agent", "spr_analyze_drawing", "spr_import_network", "hvac_apply_to_fds", "shape_add_arch"]) {
      assert.ok(tools.some((t) => t.name === n), `${n} missing`);
    }
    for (const n of ["bulc_connection_status", "bulc_knowledge_search", "bulc_get_rules", "bulc_plan_check", "bulc_drawing_intake", "bulc_check_deck", "bulc_mesh_advisor", "bulc_find_tools", "get_project_summary", "run_simulation"]) {
      assert.equal(tools.filter((t) => t.name === n).length, 1, `${n} must be listed once`);
    }
    assert.ok(!tools.some((t) => t.name === "bulc_call"), "bulc_call is compact-profile only");
  });

  test("annotates app tools", async () => {
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.equal(by.list_obstacles.annotations.readOnlyHint, true);
    assert.equal(by.remove_obstacle.annotations.destructiveHint, true);
    assert.equal(by.add_wall.annotations.destructiveHint, false);
    assert.equal(by.set_time.annotations.idempotentHint, true);
    assert.equal(by.project_info.annotations.readOnlyHint, true);
    assert.equal(by.project_open.annotations.destructiveHint, true);
    assert.equal(by.sim_status.annotations.readOnlyHint, true);
    assert.match(by.sim_start.description, /sim_preflight/);
    assert.match(by.capture_view.description, /savePath also writes a PNG/);
    assert.match(by.spr_add_node.description, /unique label/);
    assert.match(by.set_all_boundaries_open.description, /\[bulc-mcp rules\].*VENT-002/);
  });

  test("lists the remote-work tools and hides the app-only ones", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const n of ["project_info", "project_open", "project_save", "project_export_fds", "sim_preflight", "sim_start", "sim_status", "fire_results_summary", "fire_compute_aset", "output_add_tenability_slices", "capture_view", "evac_run", "evac_status", "evac_get_results", "arch_analyze_drawing", "arch_import_building", "arch_import_floorplan_report", "fds_apply_text", "get_conventions"]) {
      assert.ok(names.has(n), `${n} missing from the snapshot`);
    }
    for (const n of ["rewrite_fds_via_ai", "request_simulation_run"]) assert.ok(!names.has(n), `${n} is app-only and must not be listed`);
  });

  test("never pushes a description over 1,024 characters", async () => {
    const { tools } = await client.listTools();
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "tools-snapshot.json"), "utf8"));
    const original = new Map(snap.tools.map((t) => [t.name, t.description.length]));
    const over = tools.filter((t) => t.description.length > 1024 && (original.get(t.name) ?? 0) <= 1024).map((t) => `${t.name}:${t.description.length}`);
    assert.deepEqual(over, []);
  });

  test("the bundled snapshot carries the app's tools hash and liveOnly flags", () => {
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "tools-snapshot.json"), "utf8"));
    const hash = crypto.createHash("sha256").update(JSON.stringify(snap.tools)).digest("hex");
    assert.equal(snap.sha256, hash);
    assert.equal(snap.toolsHash, hash.slice(0, 16));
    assert.ok(snap.tools.filter((t) => t.liveOnly === true).length >= 5);
  });

  test("snapshot carries no customer-style or private strings", async () => {
    const { tools } = await client.listTools();
    const blob = JSON.stringify(tools);
    assert.doesNotMatch(blob, /[A-Za-z]:[\\/]+Users[\\/]/);
    assert.doesNotMatch(blob, /answer:/i);
  });

  test("connection status explains what to do", async () => {
    const r = await call(client, "bulc_connection_status");
    assert.match(r.text, /연결되지 않았습니다/);
    assert.match(r.text, /BULC_BRIDGE_PORT/);
    assert.equal(r.isError, false);
  });

  test("app tool calls fail with a clear bilingual message", async () => {
    const r = await call(client, "set_mesh", { ni: 10, nj: 10, nk: 10 });
    assert.equal(r.isError, true);
    assert.match(r.text, /BULC 앱에 연결할 수 없습니다/);
    assert.match(r.text, /Cannot reach the BULC desktop app/);
  });

  test("an invented tool is reported as unknown with suggestions", async () => {
    const r = await call(client, "add_sprinklr_head", {});
    assert.equal(r.isError, true);
    assert.match(r.text, /Unknown tool: add_sprinklr_head/);
    assert.match(r.text, /spr_add_sprinkler_head|add_sprinkler/);
  });

  test("run_simulation refuses cleanly without the app", async () => {
    const r = await call(client, "run_simulation", { folder_name: "x" });
    assert.equal(r.isError, true);
    assert.match(r.text, /BULC/);
  });
});

describe("(b) BULC running — live tools and forwarding", () => {
  let stub;
  let client;
  let validateMessage = "점검 통과 (경고 1건) — 실행 가능합니다.";
  const png = path.join(os.tmpdir(), `bulc-mcp-test-${process.pid}.png`);
  before(async () => {
    // 1×1 PNG
    fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    stub = await startStubBridge({
      onCall: (name, args) => {
        if (name === "validate_project") return { message: validateMessage };
        if (name === "shape_screenshot") return { message: `스크린샷 저장: ${png} — 이 PNG 를 열어 형상을 검토하세요.` };
        if (name === "set_mesh" && args.ni === -1) return { message: "Tool input error (set_mesh): 'ni' must be positive" };
        if (name === "ghost_tool") return { message: "Unknown tool: ghost_tool" };
        if (name === "preview_fds") return { message: "FDS 덱 미리보기\n\n&HEAD CHID='live' /\n&TIME T_END=60. /\n&MESH IJK=10,10,10, XB=0,1,0,1,0,1 /\n&VENT MB='XMAX', SURF_ID='OPEN' /\n&SLCF PBY=0.5, QUANTITY='TEMPERATURE' /\n" };
        if (name === "capture_view")
          return {
            message: "화면 캡처: 2d (1×1 px)",
            action: null,
            data: { view: "2d", width: 1, height: 1 },
            image: { base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", mimeType: "image/png" },
          };
        if (name === "sim_preflight") return { message: "사전 점검: ok\n{\"ok\":true}", data: { ok: true, errors: [], warnings: [{ rule: "OUT-001", message: "x" }] } };
        if (name === "project_info") return { message: "Tool input error (project_info): bad", data: { should: "not pass" } };
        return null;
      },
    });
    client = await connect({ BULC_BRIDGE_URL: stub.url });
  });
  after(async () => {
    await client?.close();
    await stub?.close();
    fs.rmSync(png, { force: true });
  });

  test("live list wins and app-only tools appear", async () => {
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === "brand_new_tool"));
    assert.match(tools.find((t) => t.name === "set_mesh").description, /^live set_mesh/);
    assert.equal(tools.filter((t) => t.name === "get_project_summary").length, 1);
  });

  test("forwards arguments verbatim and never sends an Origin header", async () => {
    const r = await call(client, "set_mesh", { ni: 40, nj: 30, nk: 20 });
    assert.equal(r.isError, false);
    assert.match(r.text, /applied set_mesh/);
    const req = stub.requests.find((x) => x.url === "/call" && x.body?.name === "set_mesh");
    assert.deepEqual(req.body.args, { ni: 40, nj: 30, nk: 20 });
    assert.equal(req.headers.origin, undefined);
    assert.match(req.headers["content-type"], /^application\/json/);
    assert.equal(req.headers.host, `127.0.0.1:${stub.port}`);
  });

  test("app-side input errors become isError with a hint", async () => {
    const r = await call(client, "set_mesh", { ni: -1, nj: 1, nk: 1 });
    assert.equal(r.isError, true);
    assert.match(r.text, /GEN-005/);
    const u = await call(client, "ghost_tool", {});
    assert.equal(u.isError, true);
    assert.match(u.text, /Unknown tool/);
  });

  test("summary and connection status", async () => {
    const s = await call(client, "get_project_summary");
    assert.match(s.text, /"chid": "stub"/);
    const st = await call(client, "bulc_connection_status");
    assert.match(st.text, /BULC 앱 연결됨/);
  });

  test("run_simulation validates first and starts when the check passes", async () => {
    validateMessage = "점검 통과 (경고 1건) — 실행 가능합니다.";
    const before = stub.requests.filter((x) => x.url === "/run").length;
    const r = await call(client, "run_simulation", { folder_name: "case_a" });
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /stub\.fds/);
    assert.match(r.text, /1 warning/);
    assert.equal(stub.requests.filter((x) => x.url === "/run").length, before + 1);
    const run = stub.requests.filter((x) => x.url === "/run").at(-1);
    assert.equal(run.body.folder_name, "case_a");
  });

  test("run_simulation refuses when validate_project reports errors", async () => {
    validateMessage = "점검 실패 — 오류 2건. 이대로는 내보내기/실행이 되지 않습니다.\n[오류]\n1. T_END ...";
    const before = stub.requests.filter((x) => x.url === "/run").length;
    const r = await call(client, "run_simulation", { folder_name: "case_b" });
    assert.equal(r.isError, true);
    assert.match(r.text, /실행하지 않았습니다/);
    assert.equal(stub.requests.filter((x) => x.url === "/run").length, before, "/run must not be called");
    validateMessage = "점검 통과 — 오류·경고 없습니다.";
  });

  test("validate_project failure text gets a pointer to the rules", async () => {
    validateMessage = "점검 실패 — 오류 1건.";
    const r = await call(client, "validate_project");
    assert.equal(r.isError, false);
    assert.match(r.text, /GEN-016/);
    validateMessage = "점검 통과 — 오류·경고 없습니다.";
  });

  test("screenshot PNG is attached as image content", async () => {
    const r = await call(client, "shape_screenshot", {});
    const img = r.raw.content.find((c) => c.type === "image");
    assert.ok(img, "image content expected");
    assert.equal(img.mimeType, "image/png");
  });

  test("an app picture (capture_view) becomes image content and data becomes structuredContent", async () => {
    const r = await call(client, "capture_view", { view: "2d" });
    assert.equal(r.isError, false, r.text);
    const img = r.raw.content.find((c) => c.type === "image");
    assert.ok(img, "image content expected");
    assert.equal(img.mimeType, "image/png");
    assert.deepEqual(r.raw.structuredContent, { view: "2d", width: 1, height: 1 });
  });

  test("structured results pass through, but not on errors", async () => {
    const p = await call(client, "sim_preflight", {});
    assert.equal(p.raw.structuredContent.ok, true);
    assert.equal(p.raw.structuredContent.warnings[0].rule, "OUT-001");
    const e = await call(client, "project_info", {});
    assert.equal(e.isError, true);
    assert.equal(e.raw.structuredContent, undefined);
  });

  test("bulc_check_deck can read the app's deck", async () => {
    const r = await call(client, "bulc_check_deck", { from_app: true });
    assert.equal(r.isError, false);
    assert.match(r.text, /CHID live/);
    assert.match(r.text, /0 error/);
  });

  test("live resources", async () => {
    const res = await client.readResource({ uri: "bulc://project/summary" });
    assert.match(res.contents[0].text, /stub/);
  });
});

describe("(c) BULC started after the client — tools/list_changed", () => {
  test("notifies when the app appears", async () => {
    const port = await freePort();
    const client = await connect({ BULC_BRIDGE_URL: `http://127.0.0.1:${port}`, BULC_MCP_WATCH_MS: "200" });
    let notified = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      notified++;
    });
    const first = await client.listTools();
    assert.ok(!first.tools.some((t) => t.name === "brand_new_tool"));
    const stub = await startStubBridge({ port });
    try {
      const deadline = Date.now() + 8000;
      while (!notified && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      assert.ok(notified > 0, "expected notifications/tools/list_changed");
      const second = await client.listTools();
      assert.ok(second.tools.some((t) => t.name === "brand_new_tool"));
    } finally {
      await client.close();
      await stub.close();
    }
  });
});

describe("(d) a different program on the bridge port", () => {
  test("is identified as not BULC", async () => {
    const foreign = await startForeignServer();
    const client = await connect({ BULC_BRIDGE_URL: foreign.url });
    try {
      const st = await call(client, "bulc_connection_status");
      assert.match(st.text, /BULC 가 아닌 프로그램/);
      const r = await call(client, "set_mesh", { ni: 1, nj: 1, nk: 1 });
      assert.equal(r.isError, true);
      assert.match(r.text, /BULC/);
      const { tools } = await client.listTools();
      assert.ok(tools.length > 200, "falls back to the snapshot");
    } finally {
      await client.close();
      await foreign.close();
    }
  });
});

describe("(e) compact profile and safety switches", () => {
  test("compact lists only local tools and forwards with bulc_call", async () => {
    const stub = await startStubBridge();
    const client = await connect({ BULC_BRIDGE_URL: stub.url, BULC_MCP_PROFILE: "compact" });
    try {
      const { tools } = await client.listTools();
      assert.ok(tools.length < 20, `compact should be small, got ${tools.length}`);
      assert.ok(tools.some((t) => t.name === "bulc_call"));
      const found = await call(client, "bulc_find_tools", { query: "mesh" });
      assert.match(found.text, /set_mesh/);
      const r = await call(client, "bulc_call", { name: "set_mesh", args: { ni: 8, nj: 8, nk: 8 } });
      assert.match(r.text, /applied set_mesh/);
    } finally {
      await client.close();
      await stub.close();
    }
  });

  test("non-loopback bridge hosts are refused without a network attempt", async () => {
    const client = await connect({ BULC_BRIDGE_URL: "http://192.0.2.10:8787" });
    try {
      const st = await call(client, "bulc_connection_status");
      assert.match(st.text, /루프백/);
      const r = await call(client, "set_mesh", { ni: 1, nj: 1, nk: 1 });
      assert.equal(r.isError, true);
      assert.match(r.text, /BULC_MCP_ALLOW_REMOTE/);
    } finally {
      await client.close();
    }
  });

  test("BULC_MCP_HIDE_TOOLS hides a tool from the list and from calls", async () => {
    const client = await connect({ BULC_MCP_HIDE_TOOLS: "project_new" });
    try {
      const { tools } = await client.listTools();
      assert.ok(!tools.some((t) => t.name === "project_new"));
      const r = await call(client, "project_new", { discard_unsaved: true });
      assert.equal(r.isError, true);
      assert.match(r.text, /BULC_MCP_HIDE_TOOLS/);
    } finally {
      await client.close();
    }
  });
});

describe("(f) discovery file and bridge token", () => {
  const token = "0123456789abcdef".repeat(3);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bulc-mcp-discovery-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("finds the app through its discovery file and sends the token there", async () => {
    const stub = await startStubBridge({
      token,
      health: { ok: true, app: "bulc", appVersion: "99.0.0", bridgeVersion: 2, hasProject: true, toolCount: 5, toolsHash: "0000000000000000", auth: "all" },
    });
    const file = path.join(dir, "bridge.json");
    fs.writeFileSync(file, JSON.stringify({ app: "bulc", url: stub.url, port: stub.port, pid: process.pid, auth: "all", token }));
    // BULC_BRIDGE_PORT=1 is dead: only the discovery file can lead to the app
    const client = await connect({ BULC_BRIDGE_URL: "", BULC_BRIDGE_PORT: "1", BULC_BRIDGE_DISCOVERY_FILE: file });
    try {
      const st = await call(client, "bulc_connection_status");
      assert.match(st.text, /BULC 앱 연결됨/);
      assert.match(st.text, /discovery file/);
      assert.match(st.text, /differs from the bundled snapshot/);
      const { tools } = await client.listTools();
      assert.ok(tools.some((t) => t.name === "brand_new_tool"), "live list fetched with the token");
      const r = await call(client, "set_mesh", { ni: 8, nj: 8, nk: 8 });
      assert.equal(r.isError, false, r.text);
      const req = stub.requests.find((x) => x.url === "/call");
      assert.equal(req.headers.authorization, `Bearer ${token}`);
    } finally {
      await client.close();
      await stub.close();
    }
  });

  test("ignores a discovery file left behind by a process that has ended", async () => {
    const stub = await startStubBridge();
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    const file = path.join(dir, "stale.json");
    fs.writeFileSync(file, JSON.stringify({ app: "bulc", url: stub.url, pid: gone, token }));
    const client = await connect({ BULC_BRIDGE_URL: "", BULC_BRIDGE_PORT: "1", BULC_BRIDGE_DISCOVERY_FILE: file });
    try {
      const st = await call(client, "bulc_connection_status");
      assert.match(st.text, /연결되지 않았습니다/);
      assert.match(st.text, /127\.0\.0\.1:1\b/);
      assert.equal(stub.requests.length, 0, "the stale address must not be contacted");
    } finally {
      await client.close();
      await stub.close();
    }
  });

  test("a bridge that wants a token explains how to give it; BULC_BRIDGE_TOKEN fixes it", async () => {
    const stub = await startStubBridge({ token });
    const without = await connect({ BULC_BRIDGE_URL: stub.url });
    try {
      const r = await call(without, "set_mesh", { ni: 8, nj: 8, nk: 8 });
      assert.equal(r.isError, true);
      assert.match(r.text, /BULC_BRIDGE_TOKEN/);
    } finally {
      await without.close();
    }
    const withToken = await connect({ BULC_BRIDGE_URL: stub.url, BULC_BRIDGE_TOKEN: token });
    try {
      const r = await call(withToken, "set_mesh", { ni: 8, nj: 8, nk: 8 });
      assert.equal(r.isError, false, r.text);
    } finally {
      await withToken.close();
      await stub.close();
    }
  });
});
