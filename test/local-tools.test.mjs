// Local tools that work without the app.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { ROOT, call, connect } from "./helpers.mjs";

const ex = (...p) => path.join(ROOT, "examples", ...p);

/** Minimal stored (uncompressed) ZIP writer for the intake test. */
function makeZip(entries) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe("knowledge tools", () => {
  let client;
  before(async () => (client = await connect()));
  after(async () => client?.close());

  test("exact rule id lookup returns the full rule and its mistakes", async () => {
    const r = await call(client, "bulc_knowledge_search", { query: "FIRE-001" });
    assert.match(r.text, /^FIRE-001 \[error/m);
    assert.match(r.text, /LLM-001/);
  });

  test("Korean free text finds the right rules", async () => {
    const r = await call(client, "bulc_knowledge_search", { query: "배관망 압력 MPa bar", kinds: ["rule"], limit: 3 });
    assert.match(r.text, /SPR-011/);
    const e = await call(client, "bulc_knowledge_search", { query: "피난 floorIndex", limit: 5 });
    assert.match(e.text, /EVAC-001/);
  });

  test("FDS keys and errors are searchable", async () => {
    const k = await call(client, "bulc_knowledge_search", { query: "PROP.ACTIVATION_TEMPERATURE" });
    assert.match(k.text, /ERROR 934/);
    const e = await call(client, "bulc_knowledge_search", { query: "ERROR(314)" });
    assert.match(e.text, /REAC/);
  });

  test("bulc_get_rules filters by domain and severity", async () => {
    const r = await call(client, "bulc_get_rules", { domain: "sprinkler", min_severity: "error" });
    assert.match(r.text, /SPR-010/);
    assert.doesNotMatch(r.text, /\[warning/);
    const t = await call(client, "bulc_get_rules", { tool: "set_all_boundaries_open", format: "full" });
    assert.match(t.text, /VENT-002/);
    assert.match(t.text, /condition:/);
  });
});

describe("bulc_plan_check", () => {
  let client;
  before(async () => (client = await connect()));
  after(async () => client?.close());

  test("catches the usual mistakes", async () => {
    const r = await call(client, "bulc_plan_check", {
      goal: "build a room",
      steps: [
        "new_project {}",
        { tool: "add_obstacle", args: { id: "B", xb: [2, 1, 0, 1, 0, 1] } },
        { tool: "add_fire", args: { hrrpua: 3000, xb: [0, 1, 0, 1, 0, 0] } },
        { tool: "set_mesh_cell_size", args: { cellsize: 0.1 } },
        { tool: "set_all_boundaries_open" },
        { tool: "spr_add_node", args: { x: 1, y: 1, z: 2.9 } },
        { tool: "spr_apply_to_fds" },
        { tool: "save_project", args: { path: "x.bulc" } },
        { tool: "evac_run" },
        { tool: "run_simulation" },
      ],
    });
    const s = r.raw.structuredContent;
    assert.equal(s.verdict, "fix_before_acting");
    const rules = new Set(s.findings.map((f) => f.rule));
    for (const id of ["GEN-014", "GEN-003", "FIRE-001", "GEN-015", "GEN-005", "VENT-002", "SPR-004", "GEN-006", "GEN-016", "GEN-018", "GEN-021", "EVAC-004"]) {
      assert.ok(rules.has(id), `${id} expected, got ${[...rules].join(",")}`);
    }
    assert.match(r.text, /did you mean 'cell_size'/);
    assert.match(r.text, /use project_save/, "save_project is mapped to the app's project_save");
  });

  test("checks the remote-work flow: drawings, labels, preflight, runs and evacuation", async () => {
    const r = await call(client, "bulc_plan_check", {
      goal: "Import the floor plan drawing, add sprinklers and HVAC, run fire and evacuation",
      fire_requested_by_user: true,
      steps: [
        { tool: "arch_analyze_drawing", args: { filePath: "plan.dxf" } },
        { tool: "arch_import_building", args: { building: { walls: [{ start: [0, 0], end: [8, 0] }], doors: [{ wall: 0, position: 0.5 }] }, dryRun: false } },
        { tool: "spr_add_node", args: { x: 1, y: 1, z: 2.8, type: "sprinkler", label: "H1" } },
        { tool: "spr_add_node", args: { x: 3, y: 1, z: 2.8, type: "sprinkler", label: "h1" } },
        { tool: "hvac_add_node", args: { x: 2, y: 2, z: 2.8, type: "exhaust_grille" } },
        { tool: "project_save", args: { path: "D:/work/a.bulc", overwrite: true } },
        { tool: "sim_start", args: { force: true } },
        { tool: "evac_run", args: { confirm: true } },
        { tool: "evac_get_results", args: {} },
        { tool: "import_floorplan", args: {} },
      ],
    });
    const f = r.raw.structuredContent.findings;
    const has = (rule, re) => f.some((x) => x.rule === rule && re.test(x.message));
    assert.ok(has("GEN-012", /not an absolute path/), "relative drawing path");
    assert.ok(has("DRW-003", /dryRun/), "import without a dry run first");
    assert.ok(has("DRW-004", /counts from 1/), "wall: 0");
    assert.ok(has("GEN-021", /already used/), "duplicate label (case-insensitive)");
    assert.ok(has("GEN-021", /unique label/), "unlabelled HVAC terminal");
    assert.ok(has("GEN-014", /overwrite=true/), "overwrite needs the user's consent");
    assert.ok(has("GEN-006", /sim_preflight|validate_project/), "sim_start without a check after edits");
    assert.ok(has("GEN-016", /confirm=true/), "sim_start without confirm");
    assert.ok(has("GEN-016", /force=true/), "sim_start force");
    assert.ok(has("GEN-016", /go-ahead/), "no user confirmation of the run");
    assert.ok(has("EVAC-004", /evac_status/), "results read before the run finished");
    assert.ok(has("GEN-005", /arch_analyze_drawing/), "invented import tool mapped to arch_*");
    assert.equal(r.raw.structuredContent.playbook, "04-sprinkler-design-fds-activation");
  });

  test("sim_preflight counts as the pre-run check and saving is not a model edit", async () => {
    const r = await call(client, "bulc_plan_check", {
      goal: "1 MW fire in the office",
      run_confirmed_by_user: true,
      steps: [
        { tool: "add_fire", args: { hrrpua: 500, xb: [3, 5, 2.5, 3.5, 0, 0], tmp_front: 20 } },
        { tool: "set_time", args: { t_end: 600 } },
        { tool: "output_add_tenability_slices", args: {} },
        { tool: "sim_preflight", args: {} },
        { tool: "project_save", args: { path: "D:/work/office_fire_A.bulc" } },
        { tool: "sim_start", args: { confirm: true } },
        { tool: "sim_status", args: {} },
        { tool: "fire_results_summary", args: {} },
        { tool: "fire_compute_aset", args: {} },
      ],
    });
    const f = r.raw.structuredContent.findings;
    assert.ok(!f.some((x) => x.rule === "GEN-006"), r.text);
    assert.ok(!f.some((x) => x.rule === "GEN-016"), r.text);
    assert.ok(!f.some((x) => x.rule === "ASET-004"), r.text);
    assert.ok(!f.some((x) => x.rule === "GEN-005"), r.text);
  });

  test("a clean plan passes", async () => {
    const r = await call(client, "bulc_plan_check", {
      goal: "1 MW fire in the middle of the room",
      run_confirmed_by_user: true,
      steps: [
        { tool: "set_mesh", args: { ni: 40, nj: 30, nk: 15, xb: [0, 8, 0, 6, 0, 3] } },
        { tool: "add_wall", args: { id: "W1", start: [0, 0], end: [8, 0], thickness: 0.2, height: 3 } },
        { tool: "add_fire", args: { hrrpua: 500, xb: [3, 5, 2.5, 3.5, 0, 0], growth: "fast", time_to_peak: 146, tmp_front: 20 } },
        { tool: "add_slcf", args: { id: "T", quantity: "TEMPERATURE", pby: 3 } },
        { tool: "set_time", args: { t_end: 600 } },
        { tool: "update_dump_config", args: { dt_slcf: 1, dt_devc: 1 } },
        { tool: "set_all_boundaries_open", args: { faces: ["XMIN", "XMAX", "YMIN", "YMAX", "ZMAX"] } },
        { tool: "validate_project" },
        { tool: "run_simulation", args: { folder_name: "case_a" } },
      ],
    });
    const s = r.raw.structuredContent;
    assert.equal(s.errors, 0, r.text);
    // only the 'app not connected' warning remains in this offline test
    assert.deepEqual(s.findings.filter((f) => f.severity === "warning").map((f) => f.rule), ["GEN-018"]);
  });

  test("calculation and report steps are not treated as model edits", async () => {
    const r = await call(client, "bulc_plan_check", {
      goal: "water spray design",
      steps: [
        { tool: "spr_import_network", args: { candidateId: "c1", mode: "replace", dryRun: true } },
        { tool: "spr_import_network", args: { candidateId: "c1", mode: "replace" } },
        { tool: "validate_project" },
        { tool: "spr_run_calc", args: { mode: "design" } },
        { tool: "spr_pump_sizing", args: { mode: "from_design", fluid: "sea" } },
        { tool: "spr_design_review" },
        { tool: "spr_apply_to_fds" },
        { tool: "validate_project" },
      ],
    });
    const rules = r.raw.structuredContent.findings.map((f) => f.rule);
    assert.ok(!rules.includes("SPR-004"), r.text);
    assert.ok(!rules.includes("GEN-006"), r.text);
    assert.equal(r.raw.structuredContent.playbook, "05-marine-water-spray-iso");
  });
});

describe("bulc_drawing_intake", () => {
  let client;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bulc-mcp-intake-"));
  before(async () => (client = await connect()));
  after(async () => {
    await client?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("classifies the synthetic floor plan and extracts wall candidates", async () => {
    const r = await call(client, "bulc_drawing_intake", { path: ex("drawings", "office-plan-synthetic.dxf"), extract_geometry: true });
    assert.equal(r.raw.structuredContent.kind, "architectural_plan");
    assert.match(r.text, /units millimetre/);
    assert.match(r.text, /thickness 0\.2/);
    assert.match(r.text, /thickness 0\.1/);
    assert.match(r.text, /01-architectural-drawing-fire-aset/);
    assert.doesNotMatch(r.text, /SYNTHETIC EXAMPLE - NOT A REAL BUILDING/, "drawing text must never be echoed");
    // the app recognises plans itself; the manual add_wall path is the fallback for older apps
    const seq = r.text.slice(r.text.indexOf("tool sequence"));
    assert.ok(seq.indexOf("arch_analyze_drawing") >= 0 && seq.indexOf("arch_analyze_drawing") < seq.indexOf("add_wall"), "arch_* first");
    assert.match(seq, /arch_import_building .*dryRun/);
    assert.match(seq, /sim_preflight/);
  });

  test("classifies the synthetic piping isometric", async () => {
    const r = await call(client, "bulc_drawing_intake", { path: ex("drawings", "water-spray-iso-synthetic.dxf") });
    assert.equal(r.raw.structuredContent.kind, "piping_isometric");
    assert.match(r.text, /spr_analyze_drawing/);
    assert.match(r.text, /05-marine-water-spray-iso/);
  });

  test("routes .fds decks to bulc_check_deck and project_open", async () => {
    const r = await call(client, "bulc_drawing_intake", { path: ex("decks", "room_fire_synthetic.fds") });
    assert.equal(r.raw.structuredContent.kind, "fds_deck");
    assert.match(r.text, /bulc_check_deck/);
    assert.match(r.text, /project_open/);
  });

  test("reads PNG, PDF and ZIP headers locally", async () => {
    const png = path.join(tmp, "sprinkler-plan.png");
    fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const a = await call(client, "bulc_drawing_intake", { path: png });
    assert.equal(a.raw.structuredContent.kind, "sprinkler_plan");
    assert.match(a.text, /PNG image 1×1/);
    const pdf = path.join(tmp, "plan.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Pages >> endobj\n%%EOF\n");
    const b = await call(client, "bulc_drawing_intake", { path: pdf, purpose: "fire" });
    assert.match(b.text, /PDF 1\.4 · 1 page/);
    assert.match(b.text, /DRW-008/);
    const zip = path.join(tmp, "bundle.zip");
    fs.writeFileSync(zip, makeZip([["ISO-001.dxf", "0\nEOF\n"], ["ISO-002.dxf", "0\nEOF\n"], ["nozzle-list.pdf", "%PDF-1.4"]]));
    const c = await call(client, "bulc_drawing_intake", { path: zip });
    assert.match(c.text, /ZIP: 3 entries — \.dxf 2, \.pdf 1/);
    assert.equal(c.raw.structuredContent.kind, "piping_isometric");
  });

  test("decodes Korean layer names of pre-2007 DXF files (ANSI_949)", async () => {
    const wall = Buffer.from("baae", "hex"); // "벽" in CP949
    const parts = [
      "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1018\n9\n$DWGCODEPAGE\n3\nANSI_949\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n",
      "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n",
      wall,
      "\n10\n0.0\n20\n0.0\n11\n5000.0\n21\n0.0\n0\nLINE\n8\n",
      wall,
      "\n10\n0.0\n20\n200.0\n11\n5000.0\n21\n200.0\n0\nENDSEC\n0\nEOF\n",
    ].map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, "latin1")));
    const file = path.join(tmp, "plan-cp949.dxf");
    fs.writeFileSync(file, Buffer.concat(parts));
    const r = await call(client, "bulc_drawing_intake", { path: file, extract_geometry: true });
    assert.match(r.text, /layers \(by entity count\): 벽\(2\)/);
    assert.equal(r.raw.structuredContent.kind, "architectural_plan");
    assert.match(r.text, /start \[0, 0\.1\] end \[5, 0\.1\] thickness 0\.2 \(벽\)/);
  });

  test("refuses relative and missing paths", async () => {
    const r = await call(client, "bulc_drawing_intake", { path: "plan.dxf" });
    assert.equal(r.isError, true);
    assert.match(r.text, /절대 경로/);
    const m = await call(client, "bulc_drawing_intake", { path: path.join(tmp, "nope.dxf") });
    assert.equal(m.isError, true);
  });
});

describe("bulc_mesh_advisor and bulc_check_deck", () => {
  let client;
  before(async () => (client = await connect()));
  after(async () => client?.close());

  test("D* and 2·3·5 cell counts", async () => {
    const r = await call(client, "bulc_mesh_advisor", { hrr_kw: 1000, domain_xb: [-1, 21, -1, 13, 0, 3.6], cell_size: 0.2 });
    assert.match(r.text, /D\* = 0\.959 m/);
    assert.match(r.text, /IJK = 108, 72, 18/);
  });

  test("the clean example deck has no findings", async () => {
    const r = await call(client, "bulc_check_deck", { path: ex("decks", "room_fire_synthetic.fds") });
    assert.equal(r.raw.structuredContent.findings.length, 0, r.text);
    assert.match(r.text, /500 kW total/);
  });

  test("the broken example deck reports every planted mistake", async () => {
    const r = await call(client, "bulc_check_deck", { path: ex("decks", "broken_deck_synthetic.fds") });
    const rules = new Set(r.raw.structuredContent.findings.map((f) => f.rule));
    for (const id of ["GEN-009", "MESH-003", "MESH-010", "FIRE-001", "FIRE-003", "VENT-002", "GEN-003", "SURF-001", "GEO-006", "DEVC-009", "DEVC-006", "OUT-001", "OUT-008"]) {
      assert.ok(rules.has(id), `${id} expected`);
    }
    assert.equal(r.raw.structuredContent.counts.error, 8);
  });
});
