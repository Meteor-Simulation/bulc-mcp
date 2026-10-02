// Build step after `tsc`: compile the knowledge pack (YAML + Markdown) into build/knowledge.json
// and copy the tool snapshot next to the compiled server. The raw files stay in knowledge/ and
// are served verbatim as MCP resources.
//
//   node scripts/build-knowledge.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadSources } from "./lib/knowledge-source.mjs";

const BUILD = path.join(ROOT, "build");
fs.mkdirSync(BUILD, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const { rulesDoc, ontology, fds, promptsDoc, playbooks, glossary, examples } = loadSources();

const SEV_RANK = { error: 0, warning: 1, info: 2 };
const rules = rulesDoc.rules;
const ruleById = new Map(rules.map((r) => [r.id, r]));

// tool → rule ids (rules that name the tool in check/fix, plus error rules of the ontology classes the tool works on)
const toolRules = {};
const add = (tool, id) => {
  (toolRules[tool] ??= new Set()).add(id);
};
for (const r of rules) {
  for (const sec of ["check", "fix"]) for (const t of r[sec]?.tools ?? []) add(t, r.id);
}
for (const cls of Object.values(ontology.classes)) {
  const errorRules = (cls.rules ?? []).filter((id) => ruleById.get(id)?.severity === "error");
  for (const names of Object.values(cls.tools ?? {})) for (const t of names) for (const id of errorRules) add(t, id);
}
const toolRulesSorted = Object.fromEntries(
  Object.entries(toolRules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, ids]) => [
      t,
      [...ids].sort((a, b) => (SEV_RANK[ruleById.get(a)?.severity] ?? 9) - (SEV_RANK[ruleById.get(b)?.severity] ?? 9) || a.localeCompare(b)),
    ]),
);

const extMime = (p) => {
  const e = path.extname(p).toLowerCase();
  if (e === ".md") return "text/markdown";
  if (e === ".yaml" || e === ".yml") return "application/yaml";
  if (e === ".json") return "application/json";
  if (e === ".jsonld") return "application/ld+json";
  return "text/plain";
};

const files = [
  { uri: "bulc://knowledge/index", path: "knowledge/README.md", title: "지식 팩 안내 / Knowledge pack guide", description: "What is in the knowledge pack and how an agent should use it." },
  { uri: "bulc://knowledge/ontology", path: "knowledge/ontology.yaml", title: "온톨로지 / Domain ontology", description: "Classes, units, coordinate conventions, relations, and the tools that create/read/update each object." },
  { uri: "bulc://knowledge/ontology.jsonld", path: "knowledge/ontology.jsonld", title: "온톨로지 JSON-LD / Ontology (JSON-LD)", description: "The same ontology as a JSON-LD graph." },
  { uri: "bulc://knowledge/rules", path: "knowledge/rules.yaml", title: "모델링 규칙 / Modelling rules", description: `${rules.length} machine-readable rules (condition → check → fix) and ${rulesDoc.common_mistakes.length} common LLM mistakes.` },
  { uri: "bulc://knowledge/glossary", path: "knowledge/glossary.md", title: "용어집 / Glossary", description: "Korean ↔ English ↔ FDS keyword ↔ BULC tool, with unit conversions." },
  { uri: "bulc://knowledge/fds-6.10.1/keys", path: "knowledge/fds-6.10.1/keys.yaml", title: "FDS 6.10.1 키 참조 / FDS 6.10.1 key reference", description: "Frequently used namelist keys: type, unit, default, mistakes, BULC tool; common input errors." },
  ...playbooks.map((p) => ({ uri: `bulc://knowledge/playbooks/${p.slug}`, path: p.file, title: p.title, description: p.summary })),
  ...examples.map((e) => ({ uri: `bulc://examples/${e.slice("examples/".length)}`, path: e, title: `예제 / Example: ${e.slice("examples/".length)}`, description: "Synthetic example (generated, not a real project)." })),
].map((f) => ({ ...f, name: f.uri.replace(/^bulc:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "-"), mimeType: extMime(f.path) }));

const bundle = {
  version: pkg.version,
  builtAt: new Date().toISOString(),
  fdsVersion: rulesDoc.fds_version ?? "6.10.1",
  rules,
  mistakes: rulesDoc.common_mistakes,
  ontology: {
    meta: { id: ontology.id, title: ontology.title, updated: ontology.updated, fds_version: ontology.fds_version },
    conventions: ontology.conventions,
    areas: ontology.areas,
    classes: ontology.classes,
    triples: ontology.triples,
  },
  playbooks,
  glossary,
  fds: { syntax: fds.syntax, groups: fds.groups, errors: fds.errors },
  prompts: promptsDoc.prompts,
  files,
  toolRules: toolRulesSorted,
};

fs.writeFileSync(path.join(BUILD, "knowledge.json"), JSON.stringify(bundle));

const snapFrom = path.join(ROOT, "src", "tools-snapshot.json");
if (!fs.existsSync(snapFrom)) {
  console.error("missing src/tools-snapshot.json — run scripts/import-snapshot.mjs first");
  process.exit(1);
}
fs.copyFileSync(snapFrom, path.join(BUILD, "tools-snapshot.json"));
const snap = JSON.parse(fs.readFileSync(snapFrom, "utf8"));

// make the CLI entry executable on POSIX (npm does this for bin on install; keep local runs working too)
try {
  fs.chmodSync(path.join(BUILD, "server.js"), 0o755);
} catch {
  /* Windows or not built yet */
}

console.log(
  `knowledge.json: ${rules.length} rules, ${rulesDoc.common_mistakes.length} mistakes, ` +
    `${Object.keys(ontology.classes).length} classes, ${playbooks.length} playbooks, ${glossary.length} glossary rows, ` +
    `${Object.keys(fds.groups).length} FDS groups, ${promptsDoc.prompts.length} prompts, ${files.length} resources; ` +
    `tools-snapshot.json: ${snap.toolCount} tools (app ${snap.appVersion ?? "?"})`,
);
