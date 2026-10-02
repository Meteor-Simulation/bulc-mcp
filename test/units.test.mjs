// Unit tests of the pure modules (namelist reader, physics, bridge identification, config).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { parseNamelists, nums, str, strs } from "../build/fds/namelist.js";
import { characteristicDiameter, isFftFriendly, nearestFftFriendly } from "../build/fds/physics.js";
import { isLoopbackHost, looksLikeBulcHealth, readDiscovery } from "../build/bridge.js";
import { discoveryPath, loadConfig, resolveBridgeUrl } from "../build/config.js";
import { annotationsFor } from "../build/annotations.js";
import { classifyMessage, pngPaths, toStructured } from "../build/results.js";
import { checkArgs, closest } from "../build/schema-check.js";

describe("namelist reader", () => {
  test("reads records, strings, arrays, logicals, repeats and indexed keys", () => {
    const recs = parseNamelists(
      "comment R&D line\n&HEAD CHID='a/b', TITLE=\"x\" /\n&OBST XB=0,1, 0,1,0,1 SURF_IDS='A','B','C', THICKEN=.TRUE. / trailing\n&DUMP PLOT3D_SPEC_ID(3:5)='CO','CO2','O2', X=3*0.5 /\n",
    );
    assert.deepEqual(recs.map((r) => r.group), ["HEAD", "OBST", "DUMP"]);
    assert.equal(str(recs[0], "CHID"), "a/b");
    assert.deepEqual(nums(recs[1], "XB"), [0, 1, 0, 1, 0, 1]);
    assert.deepEqual(strs(recs[1], "SURF_IDS"), ["A", "B", "C"]);
    assert.equal(recs[1].entries.find((e) => e.key === "THICKEN").values[0], true);
    assert.deepEqual(recs[2].entries[0], { key: "PLOT3D_SPEC_ID", index: "3:5", values: ["CO", "CO2", "O2"] });
    assert.deepEqual(nums(recs[2], "X"), [0.5, 0.5, 0.5]);
    assert.equal(recs[1].line, 3);
  });
});

describe("physics", () => {
  test("D* matches the textbook value", () => {
    assert.ok(Math.abs(characteristicDiameter(1000) - 0.959) < 0.002);
    assert.ok(Math.abs(characteristicDiameter(500) - 0.727) < 0.002);
  });
  test("2·3·5 helpers", () => {
    assert.ok(isFftFriendly(120));
    assert.ok(!isFftFriendly(97));
    assert.equal(nearestFftFriendly(97), 96);
    assert.equal(nearestFftFriendly(143), 144);
  });
});

describe("bridge identification and config", () => {
  test("BULC /health shape", () => {
    assert.ok(looksLikeBulcHealth({ ok: true, hasProject: true, toolCount: 214 }));
    assert.ok(!looksLikeBulcHealth({ ok: true }));
    assert.ok(!looksLikeBulcHealth({ status: "UP" }));
    assert.ok(!looksLikeBulcHealth({ ok: true, toolCount: 3, app: "other" }));
  });
  test("loopback detection", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "[::1]", "127.1.2.3"]) assert.ok(isLoopbackHost(h), h);
    for (const h of ["192.168.0.10", "example.com", "0.0.0.0"]) assert.ok(!isLoopbackHost(h), h);
  });
  test("URL precedence: URL > HOST/PORT > default", () => {
    assert.equal(resolveBridgeUrl({ BULC_BRIDGE_URL: "http://127.0.0.1:8790/", BULC_BRIDGE_PORT: "9" }).url, "http://127.0.0.1:8790");
    assert.equal(resolveBridgeUrl({ BULC_BRIDGE_PORT: "8790" }).url, "http://127.0.0.1:8790");
    assert.equal(resolveBridgeUrl({}).url, "http://127.0.0.1:8787");
    const c = loadConfig({ BULC_MCP_PROFILE: "compact", BULC_MCP_TOOLSETS: "spr, hvac", BULC_MCP_HINTS: "0" });
    assert.equal(c.profile, "compact");
    assert.deepEqual([...c.toolsets], ["spr", "hvac"]);
    assert.equal(c.hints, false);
  });
  test("discovery file location follows the app (and BULC_BRIDGE_URL disables it)", () => {
    assert.equal(discoveryPath({ APPDATA: path.join("X:", "roam") }, "win32"), path.join("X:", "roam", "BULC", "bridge.json"));
    assert.equal(discoveryPath({ XDG_CONFIG_HOME: "/cfg" }, "linux"), path.join("/cfg", "BULC", "bridge.json"));
    assert.equal(discoveryPath({ BULC_BRIDGE_DISCOVERY_FILE: "0" }), null);
    assert.equal(loadConfig({ BULC_BRIDGE_URL: "http://127.0.0.1:8790" }).discoveryFile, null);
    assert.ok(loadConfig({}).discoveryFile?.endsWith(path.join("BULC", "bridge.json")));
  });
  test("discovery file is validated", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bulc-mcp-unit-"));
    const write = (name, obj) => {
      const f = path.join(dir, name);
      fs.writeFileSync(f, typeof obj === "string" ? obj : JSON.stringify(obj));
      return f;
    };
    try {
      const ok = readDiscovery(write("ok.json", { app: "bulc", url: "http://127.0.0.1:8790", pid: process.pid, token: "ab".repeat(24) }));
      assert.equal(ok.url, "http://127.0.0.1:8790");
      assert.equal(ok.token, "ab".repeat(24));
      assert.equal(readDiscovery(write("port.json", { port: 8791 }))?.url, "http://127.0.0.1:8791");
      assert.equal(readDiscovery(write("remote.json", { url: "http://10.0.0.5:8790" })), null, "non-loopback");
      assert.equal(readDiscovery(write("other.json", { app: "other", url: "http://127.0.0.1:8790" })), null, "not BULC");
      assert.equal(readDiscovery(write("bad.json", "{not json")), null);
      assert.equal(readDiscovery(write("tok.json", { url: "http://127.0.0.1:8790", token: "x y" }))?.token, null, "malformed token dropped");
      assert.equal(readDiscovery(path.join(dir, "missing.json")), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("structured results", () => {
  test("data objects pass through, other values are wrapped, huge ones are dropped", () => {
    assert.deepEqual(toStructured({ ok: true }), { ok: true });
    assert.deepEqual(toStructured([1, 2]), { value: [1, 2] });
    assert.equal(toStructured(undefined), undefined);
    assert.equal(toStructured({ big: "x".repeat(300_000) }), undefined);
  });
});

describe("annotations, results and schema checks", () => {
  test("annotations by name", () => {
    assert.equal(annotationsFor("list_vents").readOnlyHint, true);
    assert.equal(annotationsFor("spr_remove_pipe").destructiveHint, true);
    assert.equal(annotationsFor("add_wall").destructiveHint, false);
    assert.equal(annotationsFor("rewrite_fds_via_ai").openWorldHint, true);
  });
  test("app error messages", () => {
    assert.ok(classifyMessage("Tool input error (x): bad"));
    assert.ok(classifyMessage("Unknown tool: y"));
    assert.equal(classifyMessage("점검 통과 — 오류·경고 없습니다."), null);
    assert.deepEqual(pngPaths("스크린샷 저장: C:\\tmp\\a b\\x.png — ok"), ["C:\\tmp\\a b\\x.png"]);
    assert.deepEqual(pngPaths("saved: D:\\tmp\\shot_1.png — ok"), ["D:\\tmp\\shot_1.png"]);
    assert.deepEqual(pngPaths("no image here"), []);
  });
  test("argument checks and suggestions", () => {
    const schema = { type: "object", properties: { cell_size: { type: "number" }, mode: { type: "string", enum: ["a", "b"] } }, required: ["cell_size"] };
    const issues = checkArgs(schema, { cellsize: 1, mode: "c" });
    assert.deepEqual(issues.map((i) => i.kind).sort(), ["enum", "missing", "unknown"]);
    assert.deepEqual(closest("spr_add_head", ["spr_add_sprinkler_head", "add_wall"]), ["spr_add_sprinkler_head"]);
  });
});
