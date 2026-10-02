// Deterministic FDS 6.10.1 deck checks. Every finding carries a rule id from knowledge/rules.yaml.
//
// These complement — not replace — the app's validate_project: they focus on resolution and
// best-practice issues that are easy to check from the deck text alone, and they work without
// the app (decks from elsewhere, review before import).
import { has, idOf, nums, num, parseNamelists, str, strs, type NamelistRecord } from "./namelist.js";
import { boxInside, boxTouches, boxesOverlap, characteristicDiameter, isFftFriendly, largestPrimeFactor, type Box } from "./physics.js";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  group?: string;
  id?: string;
  line?: number;
  fixTools?: string[];
}

export interface DeckSummary {
  records: number;
  groups: Record<string, number>;
  chid?: string;
  tEnd?: number;
  meshes: { id?: string; ijk: number[]; xb: Box; cell: [number, number, number]; cells: number }[];
  totalCells: number;
  minCell?: number;
  fires: { surf: string; hrrpua: number; areaM2: number; hrrKw: number; on: string }[];
  totalHrrKw: number;
  dStar?: number;
  dStarOverDx?: number;
}

export interface LintResult {
  findings: Finding[];
  summary: DeckSummary;
}

const RESERVED_SURF = new Set(["INERT", "OPEN", "MIRROR", "PERIODIC", "HVAC", "MASSLESS TRACER", "DROPLET", "MASSLESS TARGET", "PERIODIC FLOW ONLY"]);
const DUMP_INTERVALS = ["DT_SLCF", "DT_BNDF", "DT_DEVC", "DT_HRR", "DT_PL3D", "DT_SMOKE3D", "DT_CTRL", "DT_PART", "DT_ISOF"];
const SEV_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const isBox = (v: number[] | undefined): v is Box => !!v && v.length === 6 && v.every(Number.isFinite);

function xbOf(rec: NamelistRecord): Box | undefined {
  const v = nums(rec, "XB");
  return isBox(v) ? v : undefined;
}

function pointBox(rec: NamelistRecord): Box | undefined {
  const p = nums(rec, "XYZ");
  if (p && p.length === 3) return [p[0], p[0], p[1], p[1], p[2], p[2]];
  return xbOf(rec);
}

function ordered(b: Box): boolean {
  return b[0] <= b[1] && b[2] <= b[3] && b[4] <= b[5];
}

function label(rec: NamelistRecord): string {
  const id = idOf(rec);
  return id ? `&${rec.group} ID='${id}'` : `&${rec.group} (line ${rec.line})`;
}

export function lintDeck(text: string, opts: { fileName?: string } = {}): LintResult {
  const recs = parseNamelists(text);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const by = (g: string) => recs.filter((r) => r.group === g);
  const groups: Record<string, number> = {};
  for (const r of recs) groups[r.group] = (groups[r.group] ?? 0) + 1;

  // ── HEAD ──
  const head = by("HEAD")[0];
  const chid = head ? str(head, "CHID") : undefined;
  if (chid && /[.\s]/.test(chid))
    add({ rule: "GEN-009", severity: "error", group: "HEAD", line: head?.line, message: `CHID '${chid}' contains a period or space — FDS stops with ERROR(108).`, fixTools: ["set_chid"] });
  if (chid && opts.fileName) {
    const stem = opts.fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    if (stem && stem !== chid)
      add({ rule: "GEN-009", severity: "info", group: "HEAD", line: head?.line, message: `CHID '${chid}' differs from the file name '${stem}'. BULC renames CHID to the saved file name; result files follow CHID.` });
  }

  // ── TIME ──
  const time = by("TIME")[0];
  const tBegin = (time && num(time, "T_BEGIN")) ?? 0;
  const tEnd = time ? num(time, "T_END") : undefined;
  if (tEnd === undefined)
    add({ rule: "FIRE-005", severity: "warning", group: "TIME", line: time?.line, message: "T_END is not set — FDS then simulates only 1 s.", fixTools: ["set_time"] });

  // ── MESH ──
  const meshes: DeckSummary["meshes"] = [];
  const meshRecs = by("MESH");
  if (meshRecs.length === 0) add({ rule: "MESH-001", severity: "error", group: "MESH", message: "The deck has no &MESH.", fixTools: ["set_mesh", "auto_fit_mesh"] });
  for (const m of meshRecs) {
    const ijk = nums(m, "IJK") ?? [10, 10, 10];
    const xb = xbOf(m) ?? ([0, 1, 0, 1, 0, 1] as Box);
    if (!ordered(xb) || xb[0] === xb[1] || xb[2] === xb[3] || xb[4] === xb[5]) {
      add({ rule: "GEN-003", severity: "error", group: "MESH", id: idOf(m), line: m.line, message: `${label(m)}: every XB axis needs min < max (got ${xb.join(", ")}).`, fixTools: ["set_mesh"] });
      continue;
    }
    if (ijk.length !== 3 || ijk.some((n) => !Number.isInteger(n) || n < 1)) {
      add({ rule: "GEN-003", severity: "error", group: "MESH", id: idOf(m), line: m.line, message: `${label(m)}: IJK must be three positive integers.`, fixTools: ["set_mesh"] });
      continue;
    }
    const cell: [number, number, number] = [(xb[1] - xb[0]) / ijk[0], (xb[3] - xb[2]) / ijk[1], (xb[5] - xb[4]) / ijk[2]];
    const ratio = Math.max(...cell) / Math.min(...cell);
    if (ratio > 2 + 1e-9)
      add({
        rule: "MESH-003",
        severity: "warning",
        group: "MESH",
        id: idOf(m),
        line: m.line,
        message: `${label(m)}: cell aspect ratio ${ratio.toFixed(2)} (dx=${cell[0].toFixed(3)}, dy=${cell[1].toFixed(3)}, dz=${cell[2].toFixed(3)} m) — keep it ≤ 2.`,
        fixTools: ["set_mesh", "set_mesh_cell_size"],
      });
    const bad = ijk.filter((n) => !isFftFriendly(n));
    if (bad.length)
      add({
        rule: "MESH-010",
        severity: "info",
        group: "MESH",
        id: idOf(m),
        line: m.line,
        message: `${label(m)}: IJK ${ijk.join(",")} — ${bad.map((n) => `${n} has prime factor ${largestPrimeFactor(n)}`).join("; ")}. Counts made of 2, 3 and 5 suit the FFT pressure solver.`,
        fixTools: ["bulc_mesh_advisor", "set_mesh"],
      });
    meshes.push({ id: idOf(m), ijk, xb, cell, cells: ijk[0] * ijk[1] * ijk[2] });
  }
  const totalCells = meshes.reduce((a, m) => a + m.cells, 0);
  const minCell = meshes.length ? Math.min(...meshes.map((m) => Math.min(...m.cell))) : undefined;
  // multi-mesh: overlaps and cell-size ratios
  for (let i = 0; i < meshes.length; i++) {
    for (let j = i + 1; j < meshes.length; j++) {
      const a = meshes[i];
      const b = meshes[j];
      if (boxesOverlap(a.xb, b.xb)) {
        add({ rule: "MESH-005", severity: "warning", group: "MESH", id: a.id ?? b.id, message: `Meshes ${a.id ?? `#${i + 1}`} and ${b.id ?? `#${j + 1}`} overlap. Multi-mesh decks should tile the domain without overlaps.`, fixTools: ["auto_multimesh", "set_meshes"] });
      } else if (boxTouches(a.xb, b.xb)) {
        const r = Math.max(a.cell[0], b.cell[0]) / Math.min(a.cell[0], b.cell[0]);
        const log2 = Math.log2(r);
        if (Math.abs(log2 - Math.round(log2)) > 0.02)
          add({ rule: "MESH-005", severity: "warning", group: "MESH", message: `Neighbouring meshes ${a.id ?? `#${i + 1}`} and ${b.id ?? `#${j + 1}`} have a cell-size ratio of ${r.toFixed(2)}; use powers of two (1, 2, 4).`, fixTools: ["auto_multimesh"] });
      }
    }
  }
  const inAnyMesh = (b: Box) => meshes.some((m) => boxInside(b, m.xb));
  const touchesAnyMesh = (b: Box) => meshes.some((m) => boxTouches(b, m.xb));
  const domain: Box | undefined = meshes.length
    ? [Math.min(...meshes.map((m) => m.xb[0])), Math.max(...meshes.map((m) => m.xb[1])), Math.min(...meshes.map((m) => m.xb[2])), Math.max(...meshes.map((m) => m.xb[3])), Math.min(...meshes.map((m) => m.xb[4])), Math.max(...meshes.map((m) => m.xb[5]))]
    : undefined;

  // ── duplicate IDs ──
  for (const g of ["SURF", "MATL", "PROP", "DEVC", "CTRL", "PART", "SPEC", "OBST", "VENT", "HOLE", "SLCF", "MESH"]) {
    const seen = new Map<string, number>();
    for (const r of by(g)) {
      const id = idOf(r);
      if (!id) continue;
      if (seen.has(id))
        add({ rule: "GEN-004", severity: ["OBST", "VENT", "HOLE", "SLCF", "MESH"].includes(g) ? "warning" : "error", group: g, id, line: r.line, message: `Duplicate &${g} ID '${id}' (first on line ${seen.get(id)}).` });
      else seen.set(id, r.line);
    }
  }

  // ── reference tables ──
  const surfIds = new Set(by("SURF").map((r) => idOf(r)).filter((x): x is string => !!x));
  const matlIds = new Set(by("MATL").map((r) => idOf(r)).filter((x): x is string => !!x));
  const propIds = new Set(by("PROP").map((r) => idOf(r)).filter((x): x is string => !!x));
  const partIds = new Set(by("PART").map((r) => idOf(r)).filter((x): x is string => !!x));
  const devcIds = new Set(by("DEVC").map((r) => idOf(r)).filter((x): x is string => !!x));
  const ctrlIds = new Set(by("CTRL").map((r) => idOf(r)).filter((x): x is string => !!x));
  const rampIds = new Set(by("RAMP").map((r) => idOf(r)).filter((x): x is string => !!x));
  const hasReac = by("REAC").length > 0;

  const checkSurfRef = (rec: NamelistRecord, key: string) => {
    for (const s of strs(rec, key) ?? []) {
      const u = s.toUpperCase();
      if (!s || RESERVED_SURF.has(u) || surfIds.has(s)) continue;
      add({ rule: "SURF-001", severity: "error", group: rec.group, id: idOf(rec), line: rec.line, message: `${label(rec)} refers to SURF '${s}', which is not defined.`, fixTools: ["add_surface", "add_surface_from_library", "assign_surface"] });
    }
  };

  // ── SURF ──
  const fireSurfs = new Map<string, number>();
  for (const s of by("SURF")) {
    const id = idOf(s) ?? "";
    const hrrpua = num(s, "HRRPUA") ?? 0;
    const mlrpua = num(s, "MLRPUA") ?? 0;
    if (hrrpua > 0) fireSurfs.set(id, hrrpua);
    if ((hrrpua > 0 || mlrpua > 0) && !hasReac)
      add({ rule: "FIRE-003", severity: "error", group: "SURF", id, line: s.line, message: `SURF '${id}' uses HRRPUA/MLRPUA but the deck has no &REAC — FDS stops with ERROR(314).`, fixTools: ["update_reaction"] });
    if (hrrpua > 2500)
      add({ rule: "FIRE-001", severity: "warning", group: "SURF", id, line: s.line, message: `SURF '${id}' HRRPUA=${hrrpua} kW/m² is unusually high — HRRPUA is HRR divided by the burning area, not the total HRR.`, fixTools: ["update_fire", "update_surface"] });
    for (const m of strs(s, "MATL_ID") ?? []) {
      if (m && !matlIds.has(m))
        add({ rule: "SURF-001", severity: "error", group: "SURF", id, line: s.line, message: `SURF '${id}' refers to MATL '${m}', which is not defined.`, fixTools: ["add_material", "add_material_from_library"] });
    }
    for (const key of ["RAMP_Q", "RAMP_V", "RAMP_MF", "RAMP_T", "RAMP_EF"]) {
      const r = str(s, key);
      if (r && !rampIds.has(r)) add({ rule: "GEN-020", severity: "error", group: "SURF", id, line: s.line, message: `SURF '${id}' ${key}='${r}' has no &RAMP rows.`, fixTools: ["add_ramp"] });
    }
    const pid = str(s, "PART_ID");
    if (pid && !partIds.has(pid)) add({ rule: "GEN-020", severity: "error", group: "SURF", id, line: s.line, message: `SURF '${id}' PART_ID='${pid}' is not defined.` });
  }
  for (const m of by("MATL")) {
    const cp = num(m, "SPECIFIC_HEAT");
    if (cp !== undefined && cp > 50)
      add({ rule: "GEN-001", severity: "warning", group: "MATL", id: idOf(m), line: m.line, message: `MATL '${idOf(m)}' SPECIFIC_HEAT=${cp} looks like J/(kg·K); FDS expects kJ/(kg·K).`, fixTools: ["update_material"] });
  }

  // ── MISC ──
  const misc = by("MISC")[0];
  const tmpa = misc ? num(misc, "TMPA") : undefined;
  if (tmpa !== undefined && tmpa > 150)
    add({ rule: "GEN-001", severity: "warning", group: "MISC", line: misc?.line, message: `TMPA=${tmpa} looks like Kelvin; FDS reads TMPA in °C.`, fixTools: ["set_ambient"] });

  // ── OBST / HOLE ──
  const fires: DeckSummary["fires"] = [];
  for (const o of by("OBST")) {
    const xb = xbOf(o);
    if (!xb) continue;
    if (!ordered(xb))
      add({ rule: "GEN-003", severity: "error", group: "OBST", id: idOf(o), line: o.line, message: `${label(o)}: XB must be x1,x2,y1,y2,z1,z2 with min ≤ max (got ${xb.join(", ")}).`, fixTools: ["update_obstacle"] });
    else if (domain && !touchesAnyMesh(xb))
      add({ rule: "GEO-006", severity: "warning", group: "OBST", id: idOf(o), line: o.line, message: `${label(o)} lies outside every mesh and is dropped from the calculation.`, fixTools: ["set_mesh", "transform_obstacle"] });
    for (const k of ["SURF_ID", "SURF_IDS", "SURF_ID6"]) checkSurfRef(o, k);
    if (ordered(xb)) {
      const all = str(o, "SURF_ID");
      const ids3 = strs(o, "SURF_IDS");
      const ids6 = strs(o, "SURF_ID6");
      const top = ids6?.[5] ?? ids3?.[0] ?? all;
      if (top && fireSurfs.has(top)) {
        const area = (xb[1] - xb[0]) * (xb[3] - xb[2]);
        const hrrpua = fireSurfs.get(top)!;
        const sidesBurn = !!all && !ids3 && !ids6;
        fires.push({ surf: top, hrrpua, areaM2: area, hrrKw: hrrpua * area, on: `${label(o)} top face${sidesBurn ? " (SURF_ID on all faces — the sides burn too)" : ""}` });
      }
    }
  }
  for (const h of by("HOLE")) {
    const xb = xbOf(h);
    if (xb && !ordered(xb))
      add({ rule: "GEN-003", severity: "error", group: "HOLE", id: idOf(h), line: h.line, message: `${label(h)}: XB must have min ≤ max on every axis.`, fixTools: ["update_hole"] });
  }

  // ── VENT ──
  let openCount = 0;
  const openFloorVents: Box[] = [];
  for (const v of by("VENT")) {
    const surf = str(v, "SURF_ID") ?? "";
    const mb = str(v, "MB")?.toUpperCase();
    const isOpen = surf.toUpperCase() === "OPEN";
    if (isOpen) openCount++;
    checkSurfRef(v, "SURF_ID");
    const xb = xbOf(v);
    if (!mb && !has(v, "PBX") && !has(v, "PBY") && !has(v, "PBZ") && !has(v, "DB")) {
      if (!xb) continue;
      const flat = [xb[0] === xb[1], xb[2] === xb[3], xb[4] === xb[5]].filter(Boolean).length;
      if (!ordered(xb)) add({ rule: "GEN-003", severity: "error", group: "VENT", id: idOf(v), line: v.line, message: `${label(v)}: XB must have min ≤ max on every axis.`, fixTools: ["update_vent"] });
      else if (flat !== 1) add({ rule: "VENT-004", severity: "error", group: "VENT", id: idOf(v), line: v.line, message: `${label(v)}: a VENT must be a plane — exactly one axis with min = max (got ${xb.join(", ")}).`, fixTools: ["update_vent"] });
      else if (domain && !touchesAnyMesh(xb)) add({ rule: "GEO-006", severity: "warning", group: "VENT", id: idOf(v), line: v.line, message: `${label(v)} lies outside every mesh.`, fixTools: ["update_vent"] });
      if (xb && ordered(xb) && flat === 1 && fireSurfs.has(surf)) {
        const dims = [xb[1] - xb[0], xb[3] - xb[2], xb[5] - xb[4]].filter((d) => d > 0);
        const area = dims.length === 2 ? dims[0] * dims[1] : 0;
        fires.push({ surf, hrrpua: fireSurfs.get(surf)!, areaM2: area, hrrKw: fireSurfs.get(surf)! * area, on: label(v) });
      }
      if (isOpen && xb && domain && xb[4] === xb[5] && Math.abs(xb[4] - domain[4]) < 1e-6) openFloorVents.push(xb);
    } else if (isOpen && mb === "ZMIN" && domain) {
      openFloorVents.push([domain[0], domain[1], domain[2], domain[3], domain[4], domain[4]]);
    }
  }
  if (meshes.length && openCount === 0)
    add({ rule: "VENT-001", severity: "warning", group: "VENT", message: "No OPEN boundary — a sealed domain traps pressure and the fire soon runs out of oxygen.", fixTools: ["set_open_boundary", "set_all_boundaries_open"] });
  if (domain && openFloorVents.length) {
    // a burner VENT lying on the domain floor where the floor itself is OPEN
    const burner = by("VENT").find((v) => {
      const xb = xbOf(v);
      return !!xb && fireSurfs.has(str(v, "SURF_ID") ?? "") && xb[4] === xb[5] && Math.abs(xb[4] - domain[4]) < 1e-6 && openFloorVents.some((o) => boxTouches(xb, o));
    });
    if (burner)
      add({ rule: "VENT-002", severity: "error", group: "VENT", id: idOf(burner), line: burner.line, message: `The domain floor (ZMIN) is OPEN where the floor burner ${label(burner)} sits — the burner loses its solid base. Open only the faces that lead outside.`, fixTools: ["set_all_boundaries_open", "set_open_boundary"] });
  }

  // ── fires and resolution ──
  const totalHrrKw = fires.reduce((a, f) => a + f.hrrKw, 0);
  let dStar: number | undefined;
  let dStarOverDx: number | undefined;
  if (totalHrrKw > 0 && minCell) {
    dStar = characteristicDiameter(totalHrrKw, tmpa ?? 20);
    // resolution at the fire: the finest mesh that contains a burner
    dStarOverDx = dStar / minCell;
    if (dStarOverDx < 4)
      add({ rule: "MESH-002", severity: "warning", group: "MESH", message: `D* = ${dStar.toFixed(2)} m for ${totalHrrKw.toFixed(0)} kW; the finest cell ${minCell.toFixed(3)} m gives D*/dx = ${dStarOverDx.toFixed(1)} (< 4, coarse). Aim for 4–16.`, fixTools: ["set_mesh_cell_size", "auto_multimesh", "bulc_mesh_advisor"] });
    else if (dStarOverDx > 20)
      add({ rule: "MESH-002", severity: "info", group: "MESH", message: `D*/dx = ${dStarOverDx.toFixed(1)} (> 16): finer than usually needed for this ${totalHrrKw.toFixed(0)} kW fire; check run time and memory (MESH-007).`, fixTools: ["bulc_mesh_advisor"] });
  }
  for (const f of fires) {
    if (minCell && f.areaM2 > 0 && f.areaM2 < minCell * minCell * 0.999)
      add({ rule: "FIRE-010", severity: "warning", group: "SURF", message: `Burner ${f.on} (${f.areaM2.toFixed(3)} m²) is smaller than one cell face (${(minCell * minCell).toFixed(3)} m²); the grid-snapped area — and so the HRR — will differ.`, fixTools: ["update_fire"] });
  }

  // ── DUMP ──
  const dump = by("DUMP")[0];
  if (dump && tEnd !== undefined) {
    for (const k of DUMP_INTERVALS) {
      const v = num(dump, k);
      if (v !== undefined && v > 0 && v >= tEnd - tBegin)
        add({ rule: "OUT-001", severity: "warning", group: "DUMP", line: dump.line, message: `${k}=${v} s is not shorter than the simulated time (${tEnd - tBegin} s) — only the t=0 frame is written.`, fixTools: ["update_dump_config"] });
    }
  }
  if (meshes.length && by("SLCF").length === 0)
    add({ rule: "OUT-008", severity: "warning", group: "SLCF", message: "No &SLCF — the result viewer will have no slices to show.", fixTools: ["add_slcf"] });
  if (fires.length && !(dump && num(dump, "DT_PL3D") !== undefined))
    add({ rule: "OUT-004", severity: "info", group: "DUMP", message: "No DT_PL3D: Plot3D is not written. ASET reports and FED coupling read Plot3D first.", fixTools: ["set_plot3d_outputs", "update_dump_config"] });

  // ── RAMP ──
  const rampRows = new Map<string, { t: number; line: number }[]>();
  for (const r of by("RAMP")) {
    const id = idOf(r);
    const t = num(r, "T") ?? num(r, "TEMPERATURE");
    if (!id || t === undefined) continue;
    (rampRows.get(id) ?? rampRows.set(id, []).get(id)!).push({ t, line: r.line });
  }
  for (const [id, rows] of rampRows) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].t <= rows[i - 1].t) {
        add({ rule: "FIRE-008", severity: "warning", group: "RAMP", id, line: rows[i].line, message: `RAMP '${id}': T must increase from row to row (row at line ${rows[i].line}).`, fixTools: ["update_ramp"] });
        break;
      }
    }
  }

  // ── DEVC / PROP / CTRL ──
  const propRecs = new Map(by("PROP").map((p) => [idOf(p) ?? "", p]));
  const linkProps = new Set<string>();
  for (const d of by("DEVC")) {
    const q = (strs(d, "QUANTITY") ?? [])[0]?.toUpperCase() ?? "";
    const pid = str(d, "PROP_ID");
    const box = pointBox(d);
    if (box && domain && !inAnyMesh(box))
      add({ rule: "GEO-006", severity: "warning", group: "DEVC", id: idOf(d), line: d.line, message: `${label(d)} is not fully inside a mesh (FDS stops with ERROR(937) when it is partly outside, and drops it when fully outside).`, fixTools: ["update_device"] });
    if ((q === "LINK TEMPERATURE" || q === "SPRINKLER LINK TEMPERATURE" || q === "CHAMBER OBSCURATION") && !pid)
      add({ rule: "DEVC-009", severity: "error", group: "DEVC", id: idOf(d), line: d.line, message: `${label(d)} QUANTITY='${q}' needs a PROP_ID (FDS ERROR ${q === "CHAMBER OBSCURATION" ? "931" : "933"}).`, fixTools: ["add_heat_detector", "add_smoke_detector", "add_sprinkler"] });
    if (pid && !propIds.has(pid))
      add({ rule: "DEVC-009", severity: "error", group: "DEVC", id: idOf(d), line: d.line, message: `${label(d)} PROP_ID='${pid}' is not defined.`, fixTools: ["add_prop"] });
    if (pid && (q === "LINK TEMPERATURE" || q === "SPRINKLER LINK TEMPERATURE")) linkProps.add(pid);
    const cid = str(d, "CTRL_ID");
    if (cid && !ctrlIds.has(cid))
      add({ rule: "DEVC-004", severity: "error", group: "DEVC", id: idOf(d), line: d.line, message: `${label(d)} CTRL_ID='${cid}' does not exist — FDS stops with ERROR(938).`, fixTools: ["add_control", "update_device"] });
  }
  for (const pid of linkProps) {
    const p = propRecs.get(pid);
    if (p && num(p, "ACTIVATION_TEMPERATURE") === undefined)
      add({ rule: "DEVC-009", severity: "error", group: "PROP", id: pid, line: p.line, message: `PROP '${pid}' is used by a link-temperature device but has no ACTIVATION_TEMPERATURE — FDS 6.10.1 has no default (ERROR 934).`, fixTools: ["update_prop"] });
  }
  for (const p of by("PROP")) {
    const id = idOf(p) ?? "";
    const part = str(p, "PART_ID");
    if (part && !partIds.has(part)) add({ rule: "GEN-020", severity: "error", group: "PROP", id, line: p.line, message: `PROP '${id}' PART_ID='${part}' is not defined.`, fixTools: ["spr_upsert_spray_profile"] });
    if (part && !has(p, "MASS_FLOW_RATE") && !has(p, "PRESSURE_RAMP")) {
      const flow = (num(p, "FLOW_RATE") ?? -1) > 0;
      const k = (num(p, "K_FACTOR") ?? -1) > 0;
      const pr = (num(p, "OPERATING_PRESSURE") ?? -1) > 0;
      if (!flow && Number(k) + Number(pr) < 2)
        add({ rule: "SPR-012", severity: "error", group: "PROP", id, line: p.line, message: `PROP '${id}' sprays PART '${part}' but gives too few flow keys — FDS needs two of FLOW_RATE, K_FACTOR, OPERATING_PRESSURE (ERROR 238).`, fixTools: ["spr_set_head_spray", "update_prop"] });
      else if (flow && !k && !pr)
        add({ rule: "SPR-010", severity: "warning", group: "PROP", id, line: p.line, message: `PROP '${id}' gives only FLOW_RATE; FDS then assumes K_FACTOR=10 and derives the pressure from it. Give the head's K or pressure.`, fixTools: ["spr_set_head_spray", "update_prop"] });
    }
    const sa = nums(p, "SPRAY_ANGLE");
    if (sa && sa.length >= 2 && sa[0] === sa[1])
      add({ rule: "SPR-012", severity: "error", group: "PROP", id, line: p.line, message: `PROP '${id}' SPRAY_ANGLE values are equal — FDS stops with ERROR(231).`, fixTools: ["spr_upsert_spray_profile"] });
  }
  for (const c of by("CTRL")) {
    const inputs = strs(c, "INPUT_ID") ?? [];
    const fn = str(c, "FUNCTION_TYPE")?.toUpperCase();
    if (!inputs.length && fn !== "CUSTOM" && fn !== "PID")
      add({ rule: "DEVC-006", severity: "error", group: "CTRL", id: idOf(c), line: c.line, message: `&CTRL '${idOf(c)}' has no INPUT_ID.`, fixTools: ["update_control"] });
    for (const i of inputs) {
      if (!devcIds.has(i) && !ctrlIds.has(i) && !/^CONSTANT$/i.test(i))
        add({ rule: "DEVC-006", severity: "error", group: "CTRL", id: idOf(c), line: c.line, message: `&CTRL '${idOf(c)}' INPUT_ID '${i}' is neither a DEVC nor a CTRL.`, fixTools: ["update_control"] });
    }
  }
  for (const h of by("HOLE")) {
    for (const k of ["CTRL_ID", "DEVC_ID"]) {
      const ref = str(h, k);
      if (ref && !(k === "CTRL_ID" ? ctrlIds : devcIds).has(ref))
        add({ rule: "GEN-020", severity: "error", group: "HOLE", id: idOf(h), line: h.line, message: `${label(h)} ${k}='${ref}' does not exist.`, fixTools: ["update_hole"] });
    }
  }

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.line ?? 0) - (b.line ?? 0));
  return {
    findings,
    summary: { records: recs.length, groups, chid, tEnd, meshes, totalCells, minCell, fires, totalHrrKw, dStar, dStarOverDx },
  };
}
