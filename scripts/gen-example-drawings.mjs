// Generate the synthetic example drawings in examples/drawings (ASCII DXF R12 style, units mm).
// Everything here is invented geometry — no real building, project or customer is represented.
//
//   node scripts/gen-example-drawings.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/knowledge-source.mjs";

const OUT = path.join(ROOT, "examples", "drawings");
fs.mkdirSync(OUT, { recursive: true });

class Dxf {
  constructor() {
    this.layers = new Map();
    this.blocks = [];
    this.entities = [];
    this.min = [Infinity, Infinity];
    this.max = [-Infinity, -Infinity];
  }
  layer(name, color = 7) {
    this.layers.set(name, color);
    return this;
  }
  grow(x, y) {
    this.min = [Math.min(this.min[0], x), Math.min(this.min[1], y)];
    this.max = [Math.max(this.max[0], x), Math.max(this.max[1], y)];
  }
  line(layer, x1, y1, x2, y2) {
    this.grow(x1, y1);
    this.grow(x2, y2);
    this.entities.push(["0", "LINE", "8", layer, "10", f(x1), "20", f(y1), "30", "0.0", "11", f(x2), "21", f(y2), "31", "0.0"]);
  }
  text(layer, x, y, h, s) {
    this.grow(x, y);
    this.entities.push(["0", "TEXT", "8", layer, "10", f(x), "20", f(y), "30", "0.0", "40", f(h), "1", s]);
  }
  insert(layer, block, x, y, rot = 0) {
    this.grow(x, y);
    this.entities.push(["0", "INSERT", "8", layer, "2", block, "10", f(x), "20", f(y), "30", "0.0", "50", f(rot)]);
  }
  block(name, layer, body) {
    this.blocks.push({ name, layer, body });
  }
  toString() {
    const out = [];
    const put = (...kv) => out.push(...kv);
    put("0", "SECTION", "2", "HEADER");
    put("9", "$ACADVER", "1", "AC1009");
    put("9", "$INSUNITS", "70", "4");
    put("9", "$EXTMIN", "10", f(this.min[0]), "20", f(this.min[1]), "30", "0.0");
    put("9", "$EXTMAX", "10", f(this.max[0]), "20", f(this.max[1]), "30", "0.0");
    put("0", "ENDSEC");
    put("0", "SECTION", "2", "TABLES");
    put("0", "TABLE", "2", "LAYER", "70", String(this.layers.size));
    for (const [name, color] of this.layers) put("0", "LAYER", "2", name, "70", "0", "62", String(color), "6", "CONTINUOUS");
    put("0", "ENDTAB");
    put("0", "ENDSEC");
    put("0", "SECTION", "2", "BLOCKS");
    for (const b of this.blocks) {
      put("0", "BLOCK", "8", b.layer, "2", b.name, "70", "0", "10", "0.0", "20", "0.0", "30", "0.0", "3", b.name);
      for (const e of b.body) put(...e);
      put("0", "ENDBLK", "8", b.layer);
    }
    put("0", "ENDSEC");
    put("0", "SECTION", "2", "ENTITIES");
    for (const e of this.entities) put(...e);
    put("0", "ENDSEC");
    put("0", "EOF");
    return out.join("\n") + "\n";
  }
}
const f = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

// ── 1. office floor plan: 20 m × 12 m, 200 mm outer walls, one 100 mm partition ─────────────
{
  const d = new Dxf().layer("A-WALL", 7).layer("A-DOOR", 3).layer("A-WINDOW", 4).layer("A-ANNO", 2);
  d.block("DOOR_900", "A-DOOR", [
    ["0", "LINE", "8", "A-DOOR", "10", "0.0", "20", "0.0", "30", "0.0", "11", "0.0", "21", "900.0", "31", "0.0"],
    ["0", "ARC", "8", "A-DOOR", "10", "0.0", "20", "0.0", "30", "0.0", "40", "900.0", "50", "0.0", "51", "90.0"],
  ]);
  const W = 20000;
  const H = 12000;
  const t = 200;
  // outer faces
  d.line("A-WALL", 0, 0, W, 0);
  d.line("A-WALL", W, 0, W, H);
  d.line("A-WALL", W, H, 0, H);
  d.line("A-WALL", 0, H, 0, 0);
  // inner faces
  d.line("A-WALL", t, t, W - t, t);
  d.line("A-WALL", W - t, t, W - t, H - t);
  d.line("A-WALL", W - t, H - t, t, H - t);
  d.line("A-WALL", t, H - t, t, t);
  // partition at x = 10 m, 100 mm thick
  d.line("A-WALL", 9950, t, 9950, H - t);
  d.line("A-WALL", 10050, t, 10050, H - t);
  // doors: one exit in the south wall, one in the partition
  d.insert("A-DOOR", "DOOR_900", 4000, 0, 0);
  d.insert("A-DOOR", "DOOR_900", 10000, 6000, 90);
  // windows in the north wall (glazing lines)
  for (const x of [3000, 8000, 13000, 17000]) {
    d.line("A-WINDOW", x, H - 100, x + 1500, H - 100);
  }
  d.text("A-ANNO", 1000, -1500, 300, "SYNTHETIC EXAMPLE - NOT A REAL BUILDING");
  d.text("A-ANNO", 4000, 6000, 250, "ROOM A");
  d.text("A-ANNO", 14000, 6000, 250, "ROOM B");
  fs.writeFileSync(path.join(OUT, "office-plan-synthetic.dxf"), d.toString());
}

// ── 2. water-spray piping isometric: riser + main + two zones of three nozzles ───────────────
{
  const d = new Dxf().layer("WS-PIPE", 1).layer("WS-NOZZLE", 5).layer("WS-VALVE", 6).layer("WS-TEXT", 2);
  d.block("NOZZLE_OPEN", "WS-NOZZLE", [["0", "CIRCLE", "8", "WS-NOZZLE", "10", "0.0", "20", "0.0", "30", "0.0", "40", "60.0"]]);
  d.block("VALVE_BF", "WS-VALVE", [
    ["0", "LINE", "8", "WS-VALVE", "10", "-80.0", "20", "-80.0", "30", "0.0", "11", "80.0", "21", "80.0", "31", "0.0"],
    ["0", "LINE", "8", "WS-VALVE", "10", "-80.0", "20", "80.0", "30", "0.0", "11", "80.0", "21", "-80.0", "31", "0.0"],
  ]);
  const cos30 = Math.cos(Math.PI / 6);
  const iso = (X, Y, Z) => [(X - Y) * cos30, (X + Y) * 0.5 + Z]; // isometric projection, mm
  const seg = (a, b) => {
    const p = iso(...a);
    const q = iso(...b);
    d.line("WS-PIPE", p[0], p[1], q[0], q[1]);
  };
  const P = [0, 0, 0];
  const R = [0, 0, 3000]; // riser top
  const M1 = [4000, 0, 3000];
  const M2 = [8000, 0, 3000];
  seg(P, R);
  seg(R, M1);
  seg(M1, M2);
  const zone = (M, label, valveAt) => {
    const pts = [M, [M[0], 1500, M[2]], [M[0], 3000, M[2]], [M[0], 4500, M[2]]];
    for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1]);
    for (const n of pts.slice(1)) {
      const [x, y] = iso(...n);
      d.insert("WS-NOZZLE", "NOZZLE_OPEN", x, y);
    }
    const [vx, vy] = iso(M[0], valveAt, M[2]);
    d.insert("WS-VALVE", "VALVE_BF", vx, vy);
    const [tx, ty] = iso(M[0], 2200, M[2]);
    d.text("WS-TEXT", tx + 100, ty + 100, 120, label);
  };
  zone(M1, "WS-Z1-50A", 700);
  zone(M2, "WS-Z2-50A", 700);
  const [mx, my] = iso(2000, 0, 3000);
  d.text("WS-TEXT", mx, my + 150, 120, "WS-MAIN-100A");
  const [px, py] = iso(0, 0, 0);
  d.text("WS-TEXT", px + 150, py, 120, "INLET (SYNTHETIC)");
  fs.writeFileSync(path.join(OUT, "water-spray-iso-synthetic.dxf"), d.toString());
}

console.log("wrote examples/drawings/office-plan-synthetic.dxf, examples/drawings/water-spray-iso-synthetic.dxf");
