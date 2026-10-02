// Import a tool-definition export of the BULC app into src/tools-snapshot.json (schema v2).
//
//   node scripts/import-snapshot.mjs <export.json> --app-version 0.90.0 [--generated-at ISO]
//
// The export holds names, descriptions and input schemas only (no implementation). This script
//   1. checks the shape (names, descriptions, object input schemas, no duplicates),
//   2. keeps every tool object exactly as the app lists it on GET /tools (category, annotations,
//      liveOnly …), so the snapshot hash equals the app's /health toolsHash; `category` is inferred
//      from the name only for old exports that lack it,
//   3. scans every string for generic sensitive patterns (paths, e-mail, keys) and refuses on a hit,
//   4. writes schemaVersion 2 with appVersion, generatedAt, toolCount, sha256 of the tools array and
//      toolsHash (its first 16 hex digits — the value the app reports in /health).
// Name-based screening (customer or person names) must already have happened in the private
// export step — such a list never lives in this public repository.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/knowledge-source.mjs";
import { scanText } from "./lib/public-patterns.mjs";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!file) {
  console.error("usage: node scripts/import-snapshot.mjs <export.json> --app-version X.Y.Z [--generated-at ISO]");
  process.exit(2);
}
const appVersion = opt("--app-version");
if (!appVersion || !/^\d+\.\d+\.\d+/.test(appVersion)) {
  console.error("--app-version X.Y.Z is required (the released BULC version that has exactly this tool set)");
  process.exit(2);
}

const PREFIX_CATEGORY = [
  [/^shape_/, "shape"],
  [/^spr_/, "spr"],
  [/^hvac_/, "hvac"],
  [/^evac_/, "evac"],
  [/^draw_/, "draw"],
  [/^arch_/, "arch"],
  [/^result_/, "result"],
  [/^(project_|sim_|fire_|results_|capture_view$|get_conventions$|fds_apply_text$|output_add_)/, "project"],
  [/furniture/, "furniture"],
  [/mesh/, "mesh"],
  [/(slcf|bndf|plot3d|dump|chid|preview_fds)/, "output"],
  [/(vent|boundar)/, "ventilation"],
  [/(fire|reaction|species|ramp)/, "fire"],
  [/(device|detector|thermocouple|sprinkler|nozzle|prop|control)/, "device"],
  [/material/, "material"],
  [/surface/, "surface"],
  [/(obstacle|wall|floor|door|window|hole|geom|fds_properties)/, "geometry"],
];
const inferCategory = (name) => PREFIX_CATEGORY.find(([re]) => re.test(name))?.[1] ?? "query";

const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const list = Array.isArray(raw) ? raw : raw.tools;
if (!Array.isArray(list) || list.length === 0) {
  console.error("export has no tools array");
  process.exit(1);
}
const seen = new Set();
let inferred = 0;
const tools = list.map((t, i) => {
  if (!t || typeof t.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(t.name)) throw new Error(`tool #${i}: bad name`);
  if (seen.has(t.name)) throw new Error(`duplicate tool ${t.name}`);
  seen.add(t.name);
  if (typeof t.description !== "string" || !t.description.trim()) throw new Error(`${t.name}: missing description`);
  if (t.inputSchema === undefined && t.input_schema !== undefined) {
    // very old export format — normalise (the hash then no longer matches the app, which is fine for such files)
    const { input_schema, ...rest } = t;
    t = { ...rest, inputSchema: input_schema };
  }
  if (!t.inputSchema || t.inputSchema.type !== "object") throw new Error(`${t.name}: inputSchema must be an object schema`);
  if (t.liveOnly !== undefined && typeof t.liveOnly !== "boolean") throw new Error(`${t.name}: liveOnly must be boolean`);
  if (!t.category) {
    inferred++;
    return { ...t, category: inferCategory(t.name) };
  }
  return t; // unchanged — same JSON as the app's GET /tools entry
});

const hits = [];
for (const t of tools) for (const h of scanText(JSON.stringify(t))) hits.push(`${t.name}: [${h.id}] ${h.match}`);
if (hits.length) {
  console.error(`refusing to import — ${hits.length} sensitive pattern(s):\n  ${hits.join("\n  ")}`);
  process.exit(1);
}

// Same computation as the app: sha256(JSON.stringify(tools)) — the app reports the first 16 hex digits as toolsHash.
const sha256 = crypto.createHash("sha256").update(JSON.stringify(tools)).digest("hex");
const appHash = !Array.isArray(raw) && typeof raw.sha256 === "string" ? raw.sha256 : null;
if (appHash && appHash !== sha256 && !inferred) {
  console.error(`hash mismatch: export says ${appHash.slice(0, 16)}…, recomputed ${sha256.slice(0, 16)}… — the export was edited; re-export it from the app`);
  process.exit(1);
}
const snapshot = {
  schemaVersion: 2,
  generatedFrom: "BULC desktop app — AI tool registry (names, descriptions and input schemas only)",
  appVersion,
  generatedAt: opt("--generated-at") ?? new Date().toISOString(),
  toolCount: tools.length,
  sha256,
  toolsHash: sha256.slice(0, 16),
  tools,
};
const dest = path.join(ROOT, "src", "tools-snapshot.json");
fs.writeFileSync(dest, JSON.stringify(snapshot, null, 2) + "\n");
const cats = {};
for (const t of tools) cats[t.category] = (cats[t.category] ?? 0) + 1;
console.log(
  `wrote src/tools-snapshot.json: ${tools.length} tools, app ${appVersion}, toolsHash ${sha256.slice(0, 16)}` +
    `${inferred ? ` (category inferred for ${inferred} tool(s) — hash differs from the app)` : " (= app /health toolsHash)"}, ` +
    `liveOnly ${tools.filter((t) => t.liveOnly).length}`,
);
console.log("categories:", JSON.stringify(cats));
