// Small ASCII-DXF reader for drawing intake: header units and extents, layers, entity counts,
// block references, line angles, and (on request) wall-line candidates in metres.
// It reads group-code/value pairs only; no geometry kernel, no network access.

export interface Segment {
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Insert {
  layer: string;
  block: string;
  x: number;
  y: number;
  rotation: number;
}

export interface DxfInfo {
  acadVersion?: string;
  insunits?: number;
  unitName: string;
  metresPerUnit: number | null;
  extMin?: [number, number];
  extMax?: [number, number];
  layersDeclared: string[];
  entityCounts: Record<string, number>;
  layerCounts: Record<string, number>;
  blockCounts: Record<string, number>;
  textCount: number;
  dimensionCount: number;
  segments: Segment[];
  inserts: Insert[];
  /** share of line segments at ~30°/150°/210°/330° (isometric axes) */
  isoAngleShare: number;
  /** share of line segments within 2° of horizontal or vertical */
  orthoShare: number;
  has3dZ: boolean;
}

const UNITS: Record<number, [string, number | null]> = {
  0: ["unitless", null],
  1: ["inch", 0.0254],
  2: ["foot", 0.3048],
  3: ["mile", 1609.344],
  4: ["millimetre", 0.001],
  5: ["centimetre", 0.01],
  6: ["metre", 1],
  7: ["kilometre", 1000],
  8: ["microinch", 2.54e-8],
  9: ["mil", 2.54e-5],
  10: ["yard", 0.9144],
  13: ["micron", 1e-6],
  14: ["decimetre", 0.1],
};

export function isAsciiDxf(head: string): boolean {
  return /^\s*0\s*\r?\n\s*SECTION/m.test(head.slice(0, 2000)) || /\n\s*SECTION\s*\r?\n\s*2\s*\r?\n\s*HEADER/.test(head.slice(0, 4000));
}

export function readDxf(text: string, maxSegments = 50000): DxfInfo {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) {
      i -= 1; // resync on a stray line
      continue;
    }
    pairs.push([code, lines[i + 1].trim()]);
  }

  const info: DxfInfo = {
    unitName: "unknown",
    metresPerUnit: null,
    layersDeclared: [],
    entityCounts: {},
    layerCounts: {},
    blockCounts: {},
    textCount: 0,
    dimensionCount: 0,
    segments: [],
    inserts: [],
    isoAngleShare: 0,
    orthoShare: 0,
    has3dZ: false,
  };

  let section = "";
  let i = 0;
  const n = pairs.length;
  while (i < n) {
    const [code, value] = pairs[i];
    if (code === 0 && value === "SECTION") {
      section = pairs[i + 1]?.[0] === 2 ? pairs[i + 1][1] : "";
      i += 2;
      continue;
    }
    if (code === 0 && value === "ENDSEC") {
      section = "";
      i++;
      continue;
    }
    if (section === "HEADER" && code === 9) {
      const name = value;
      const vals: Record<number, string> = {};
      let j = i + 1;
      while (j < n && pairs[j][0] !== 9 && pairs[j][0] !== 0) {
        vals[pairs[j][0]] = pairs[j][1];
        j++;
      }
      if (name === "$ACADVER") info.acadVersion = vals[1];
      if (name === "$INSUNITS") info.insunits = Number(vals[70]);
      if (name === "$EXTMIN") info.extMin = [Number(vals[10]), Number(vals[20])];
      if (name === "$EXTMAX") info.extMax = [Number(vals[10]), Number(vals[20])];
      i = j;
      continue;
    }
    if (section === "TABLES" && code === 0 && value === "LAYER") {
      let j = i + 1;
      while (j < n && pairs[j][0] !== 0) {
        if (pairs[j][0] === 2) info.layersDeclared.push(pairs[j][1]);
        j++;
      }
      i = j;
      continue;
    }
    if (section === "ENTITIES" && code === 0) {
      const type = value;
      const fields: [number, string][] = [];
      let j = i + 1;
      while (j < n && pairs[j][0] !== 0) {
        fields.push(pairs[j]);
        j++;
      }
      info.entityCounts[type] = (info.entityCounts[type] ?? 0) + 1;
      const layer = fields.find((f) => f[0] === 8)?.[1] ?? "0";
      info.layerCounts[layer] = (info.layerCounts[layer] ?? 0) + 1;
      const num = (c: number) => {
        const f = fields.find((x) => x[0] === c);
        return f ? Number(f[1]) : NaN;
      };
      if (type === "TEXT" || type === "MTEXT") info.textCount++;
      if (type === "DIMENSION") info.dimensionCount++;
      if (type === "LINE") {
        const s = { layer, x1: num(10), y1: num(20), x2: num(11), y2: num(21) };
        if ([s.x1, s.y1, s.x2, s.y2].every(Number.isFinite) && info.segments.length < maxSegments) info.segments.push(s);
        if (Math.abs(num(30) || 0) > 1e-9 || Math.abs(num(31) || 0) > 1e-9) info.has3dZ = true;
      } else if (type === "LWPOLYLINE") {
        const xs: number[] = [];
        const ys: number[] = [];
        let closed = false;
        for (const [c, v] of fields) {
          if (c === 10) xs.push(Number(v));
          else if (c === 20) ys.push(Number(v));
          else if (c === 70) closed = (Number(v) & 1) === 1;
        }
        const m = Math.min(xs.length, ys.length);
        for (let k = 0; k + 1 < m && info.segments.length < maxSegments; k++) info.segments.push({ layer, x1: xs[k], y1: ys[k], x2: xs[k + 1], y2: ys[k + 1] });
        if (closed && m > 2 && info.segments.length < maxSegments) info.segments.push({ layer, x1: xs[m - 1], y1: ys[m - 1], x2: xs[0], y2: ys[0] });
      } else if (type === "INSERT") {
        const block = fields.find((f) => f[0] === 2)?.[1] ?? "";
        info.blockCounts[block] = (info.blockCounts[block] ?? 0) + 1;
        if (info.inserts.length < 5000) info.inserts.push({ layer, block, x: num(10), y: num(20), rotation: Number.isFinite(num(50)) ? num(50) : 0 });
      }
      i = j;
      continue;
    }
    i++;
  }

  const u = info.insunits !== undefined ? UNITS[info.insunits] : undefined;
  if (u) {
    info.unitName = u[0];
    info.metresPerUnit = u[1];
  }

  let iso = 0;
  let ortho = 0;
  let counted = 0;
  for (const s of info.segments) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    counted++;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    a = ((a % 180) + 180) % 180; // fold to [0,180)
    if (Math.abs(a - 30) < 2 || Math.abs(a - 150) < 2) iso++;
    if (a < 2 || a > 178 || Math.abs(a - 90) < 2) ortho++;
  }
  info.isoAngleShare = counted ? iso / counted : 0;
  info.orthoShare = counted ? ortho / counted : 0;
  return info;
}

export interface WallCandidate {
  start: [number, number];
  end: [number, number];
  thickness: number;
  layer: string;
}

/**
 * Pair parallel axis-aligned lines 0.05–0.6 m apart into wall centre-line candidates (metres,
 * relative to the given origin). Walls drawn as single lines come back with thickness 0.
 */
export function wallCandidates(segments: Segment[], metresPerUnit: number, origin: [number, number], limit = 200): WallCandidate[] {
  type L = { c: number; a: number; b: number; layer: string; used: boolean };
  const hor: L[] = [];
  const ver: L[] = [];
  for (const s of segments) {
    const x1 = (s.x1 - origin[0]) * metresPerUnit;
    const y1 = (s.y1 - origin[1]) * metresPerUnit;
    const x2 = (s.x2 - origin[0]) * metresPerUnit;
    const y2 = (s.y2 - origin[1]) * metresPerUnit;
    if (Math.hypot(x2 - x1, y2 - y1) < 0.2) continue;
    if (Math.abs(y2 - y1) < 0.01) hor.push({ c: (y1 + y2) / 2, a: Math.min(x1, x2), b: Math.max(x1, x2), layer: s.layer, used: false });
    else if (Math.abs(x2 - x1) < 0.01) ver.push({ c: (x1 + x2) / 2, a: Math.min(y1, y2), b: Math.max(y1, y2), layer: s.layer, used: false });
  }
  const out: WallCandidate[] = [];
  const pair = (list: L[], horizontal: boolean) => {
    list.sort((p, q) => p.c - q.c);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.used) continue;
      let best: { j: number; d: number; lo: number; hi: number } | null = null;
      for (let j = i + 1; j < list.length; j++) {
        const q = list[j];
        const d = q.c - p.c;
        if (d > 0.6) break;
        if (q.used || d < 0.05) continue;
        const lo = Math.max(p.a, q.a);
        const hi = Math.min(p.b, q.b);
        if (hi - lo < 0.3) continue;
        if (!best || d < best.d) best = { j, d, lo, hi };
      }
      if (best) {
        p.used = true;
        list[best.j].used = true;
        const c = p.c + best.d / 2;
        const r = (v: number) => Math.round(v * 1000) / 1000;
        out.push(
          horizontal
            ? { start: [r(best.lo), r(c)], end: [r(best.hi), r(c)], thickness: r(best.d), layer: p.layer }
            : { start: [r(c), r(best.lo)], end: [r(c), r(best.hi)], thickness: r(best.d), layer: p.layer },
        );
      }
    }
    for (const p of list) {
      if (p.used) continue;
      const r = (v: number) => Math.round(v * 1000) / 1000;
      out.push(horizontal ? { start: [r(p.a), r(p.c)], end: [r(p.b), r(p.c)], thickness: 0, layer: p.layer } : { start: [r(p.c), r(p.a)], end: [r(p.c), r(p.b)], thickness: 0, layer: p.layer });
    }
  };
  pair(hor, true);
  pair(ver, false);
  out.sort((a, b) => b.thickness - a.thickness || Math.hypot(b.end[0] - b.start[0], b.end[1] - b.start[1]) - Math.hypot(a.end[0] - a.start[0], a.end[1] - a.start[1]));
  return out.slice(0, limit);
}
