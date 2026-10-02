// Shared loader for the knowledge sources (YAML + Markdown) used by the build and the linter.
// Node built-ins + the `yaml` dev dependency only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

export const RULE_ID = /\b(?:GEN|GEO|MESH|VENT|FIRE|SURF|DEVC|OUT|SIM|EVAC|HVAC|SPR|ASET|DRW|TRB)-\d{3}\b/g;
export const MISTAKE_ID = /\bLLM-\d{3}\b/g;

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const yaml = (p) => YAML.parse(read(p), { prettyErrors: true });

function playbookFromMarkdown(file) {
  const text = read(file);
  const slug = path.basename(file, ".md");
  const num = (slug.match(/^(\d+)/) ?? [, "00"])[1];
  const title = (text.match(/^#\s+(.+)$/m) ?? [, slug])[1].trim();
  const rules = [...new Set(text.match(RULE_ID) ?? [])].sort();
  const tools = new Set();
  // tool calls written as `tool_name {json}` inside fenced blocks
  for (const block of text.match(/```[\s\S]*?```/g) ?? []) {
    for (const m of block.matchAll(/^([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*\{/gm)) tools.add(m[1]);
  }
  const sections = [];
  let current = { heading: title, lines: [] };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
      current = { heading: h[1].trim(), lines: [] };
    } else current.lines.push(line);
  }
  sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
  const summary = (text.split(/\r?\n/).find((l, i, a) => i > 0 && l.trim() && !l.startsWith("#")) ?? "").trim();
  return { id: `PB${num}`, slug, file, title, summary, rules, tools: [...tools].sort(), sections: sections.filter((s) => s.text) };
}

function glossaryRows(file) {
  const rows = [];
  let section = "";
  let header = null;
  for (const line of read(file).split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      section = h[1].trim();
      header = null;
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!header) {
      header = cells;
      continue;
    }
    rows.push({ section, header, cells, text: cells.join(" | ") });
  }
  return rows;
}

function listFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p.split(path.sep).join("/"));
  }
  return out.sort();
}

export function loadSources() {
  const rulesDoc = yaml("knowledge/rules.yaml");
  const ontology = yaml("knowledge/ontology.yaml");
  const fds = yaml("knowledge/fds-6.10.1/keys.yaml");
  const promptsDoc = yaml("prompts/prompts.yaml");
  const playbooks = listFiles("knowledge/playbooks")
    .filter((f) => f.endsWith(".md"))
    .map(playbookFromMarkdown);
  const glossary = glossaryRows("knowledge/glossary.md");
  const examples = listFiles("examples").filter((f) => !f.endsWith("/.gitkeep"));
  return { rulesDoc, ontology, fds, promptsDoc, playbooks, glossary, examples };
}

export function readText(p) {
  return read(p);
}
