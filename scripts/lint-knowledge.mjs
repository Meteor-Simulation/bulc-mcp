// Consistency check of the knowledge pack (Node port of knowledge/scripts/validate_knowledge.py plus
// tool-name cross-checks against the bundled snapshot and this server's local tools).
//
//   node scripts/lint-knowledge.mjs        → exit 1 on any problem
import fs from "node:fs";
import path from "node:path";
import { MISTAKE_ID, ROOT, RULE_ID, loadSources, readText } from "./lib/knowledge-source.mjs";

const { rulesDoc, ontology, fds, promptsDoc, playbooks } = loadSources();
const problems = [];
const warnings = [];
const P = (m) => problems.push(m);

// ── rules ──
const SEV = new Set(["error", "warning", "info"]);
const CONF = new Set(["verified", "convention", "guidance", "regulatory_verify", "engine_snapshot"]);
const REQUIRED = ["id", "domain", "severity", "confidence", "title", "title_en", "condition", "applies_to"];
const ruleIds = new Set();
for (const r of rulesDoc.rules) {
  if (ruleIds.has(r.id)) P(`duplicate rule id ${r.id}`);
  ruleIds.add(r.id);
  for (const k of REQUIRED) if (r[k] === undefined) P(`${r.id}: missing ${k}`);
  if (!SEV.has(r.severity)) P(`${r.id}: bad severity ${r.severity}`);
  if (!CONF.has(r.confidence)) P(`${r.id}: bad confidence ${r.confidence}`);
  if (!/^[A-Z]{2,4}-\d{3}$/.test(r.id)) P(`${r.id}: id format`);
}
const mistakeIds = new Set();
for (const m of rulesDoc.common_mistakes) {
  if (mistakeIds.has(m.id)) P(`duplicate mistake id ${m.id}`);
  mistakeIds.add(m.id);
  for (const id of m.rules ?? []) if (!ruleIds.has(id)) P(`${m.id}: unknown rule ${id}`);
}

// ── ontology ──
const classes = ontology.classes;
for (const [name, c] of Object.entries(classes)) {
  for (const id of c.rules ?? []) if (!ruleIds.has(id)) P(`class ${name}: unknown rule ${id}`);
  if (c.parent && !classes[c.parent]) P(`class ${name}: unknown parent ${c.parent}`);
  for (const [pred, target] of Object.entries(c.relations ?? {})) {
    for (const t of Array.isArray(target) ? target : [target]) if (!classes[t]) P(`class ${name}.${pred}: unknown class ${t}`);
  }
}
for (const [area, members] of Object.entries(ontology.areas)) for (const c of members) if (!classes[c]) P(`area ${area}: unknown class ${c}`);
for (const [s, p, o] of ontology.triples) if (!classes[s] || !classes[o] || typeof p !== "string") P(`bad triple ${s} ${p} ${o}`);
for (const r of rulesDoc.rules) for (const a of r.applies_to ?? []) if (a !== "all" && !classes[a]) P(`${r.id}: applies_to unknown class ${a}`);
if (!fs.existsSync(path.join(ROOT, "knowledge", "ontology.jsonld"))) P("knowledge/ontology.jsonld missing — run knowledge/scripts/build_ontology_jsonld.py");
else {
  const jsonld = JSON.parse(readText("knowledge/ontology.jsonld"));
  const classNodes = new Set(jsonld["@graph"].filter((n) => n["@type"] === "rdfs:Class").map((n) => n["@id"].replace(/^bulc:/, "")));
  for (const c of Object.keys(classes)) if (!classNodes.has(c)) P(`ontology.jsonld is stale (no class ${c}) — run knowledge/scripts/build_ontology_jsonld.py`);
}

// ── rule ids referenced from Markdown and the FDS key file ──
const mdFiles = [...playbooks.map((p) => p.file), "knowledge/glossary.md", "knowledge/README.md"];
for (const f of mdFiles) {
  const t = readText(f);
  for (const id of new Set(t.match(RULE_ID) ?? [])) if (!ruleIds.has(id)) P(`${f}: unknown rule ${id}`);
  for (const id of new Set(t.match(MISTAKE_ID) ?? [])) if (!mistakeIds.has(id)) P(`${f}: unknown mistake ${id}`);
}
for (const [g, grp] of Object.entries(fds.groups)) {
  for (const [k, key] of Object.entries(grp.keys)) for (const id of key.rules ?? []) if (!ruleIds.has(id)) P(`fds ${g}.${k}: unknown rule ${id}`);
}
for (const e of fds.errors) for (const id of e.rules ?? []) if (!ruleIds.has(id)) P(`fds ERROR(${e.code}): unknown rule ${id}`);

// ── prompts ──
const slugs = new Set(playbooks.map((p) => p.slug));
const promptNames = new Set();
for (const p of promptsDoc.prompts) {
  if (promptNames.has(p.name)) P(`duplicate prompt ${p.name}`);
  promptNames.add(p.name);
  if (!p.title?.ko || !p.title?.en) P(`prompt ${p.name}: needs title.ko and title.en`);
  if (p.playbook && !slugs.has(p.playbook)) P(`prompt ${p.name}: unknown playbook ${p.playbook}`);
  for (const id of p.rules ?? []) if (!ruleIds.has(id)) P(`prompt ${p.name}: unknown rule ${id}`);
  for (const id of new Set(p.template.match(RULE_ID) ?? [])) if (!ruleIds.has(id)) P(`prompt ${p.name}: template cites unknown rule ${id}`);
  const used = new Set([...p.template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]));
  const declared = new Set((p.arguments ?? []).map((a) => a.name));
  for (const u of used) if (!declared.has(u)) P(`prompt ${p.name}: template uses undeclared argument ${u}`);
}

// ── tool names ──
const snapshot = JSON.parse(readText("src/tools-snapshot.json"));
const appTools = new Set(snapshot.tools.map((t) => t.name));
const localSrc = fs.readdirSync(path.join(ROOT, "src", "local-tools")).map((f) => readText(`src/local-tools/${f}`)).join("\n");
const localTools = new Set([...localSrc.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]).filter((n) => /^(bulc_|get_project_summary$|run_simulation$)/.test(n)));
const known = new Set([...appTools, ...localTools]);
const named = new Map(); // tool → where
const note = (t, where) => (named.has(t) ? named.get(t).push(where) : named.set(t, [where]));
for (const [name, c] of Object.entries(classes)) for (const list of Object.values(c.tools ?? {})) for (const t of list) note(t, `class ${name}`);
for (const r of rulesDoc.rules) for (const sec of ["check", "fix"]) for (const t of r[sec]?.tools ?? []) note(t, r.id);
for (const [g, grp] of Object.entries(fds.groups)) for (const t of grp.tools ?? []) note(t, `fds ${g}`);
for (const p of playbooks) for (const t of p.tools) note(t, p.file);
for (const [t, where] of named) if (!known.has(t)) P(`tool '${t}' (used in ${where.slice(0, 3).join(", ")}) is neither in the snapshot nor a local tool`);

// app tools not linked to any ontology class (informational)
const linked = new Set();
for (const c of Object.values(classes)) for (const list of Object.values(c.tools ?? {})) for (const t of list) linked.add(t);
const unlinked = [...appTools].filter((t) => !linked.has(t));
if (unlinked.length) warnings.push(`${unlinked.length} app tools are not linked to an ontology class: ${unlinked.slice(0, 12).join(", ")}${unlinked.length > 12 ? ", …" : ""}`);

for (const w of warnings) console.log("note:", w);
for (const p of problems) console.log("PROBLEM:", p);
console.log(
  `lint-knowledge: rules=${ruleIds.size} mistakes=${mistakeIds.size} classes=${Object.keys(classes).length} playbooks=${playbooks.length} ` +
    `fds-groups=${Object.keys(fds.groups).length} prompts=${promptNames.size} tools-referenced=${named.size} problems=${problems.length}`,
);
process.exit(problems.length ? 1 : 0);
