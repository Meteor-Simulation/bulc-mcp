// Knowledge pack at run time: build/knowledge.json + lookups + a search index.
import fs from "node:fs";
import { BUILD_DIR, pkgPath } from "../paths.js";
import path from "node:path";
import { SearchIndex, type SearchDoc } from "./search.js";
import type { FdsGroup, KnowledgeBundle, Mistake, OntClass, Playbook, PromptDef, ResourceFile, Rule, Severity } from "./types.js";

export const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export interface ToolDoc {
  name: string;
  description: string;
  category?: string;
}

export class Knowledge {
  readonly bundle: KnowledgeBundle;
  readonly rules: Rule[];
  readonly ruleById = new Map<string, Rule>();
  readonly mistakeById = new Map<string, Mistake>();
  readonly playbookBySlug = new Map<string, Playbook>();
  readonly promptByName = new Map<string, PromptDef>();
  readonly fileByUri = new Map<string, ResourceFile>();
  readonly index: SearchIndex;

  constructor(bundle: KnowledgeBundle, tools: ToolDoc[] = []) {
    this.bundle = bundle;
    this.rules = bundle.rules;
    for (const r of bundle.rules) this.ruleById.set(r.id, r);
    for (const m of bundle.mistakes) this.mistakeById.set(m.id, m);
    for (const p of bundle.playbooks) {
      this.playbookBySlug.set(p.slug, p);
      this.playbookBySlug.set(p.id, p);
    }
    for (const p of bundle.prompts) this.promptByName.set(p.name, p);
    for (const f of bundle.files) this.fileByUri.set(f.uri, f);
    this.index = new SearchIndex(this.buildDocs(tools));
  }

  static load(tools: ToolDoc[] = []): Knowledge {
    const file = path.join(BUILD_DIR, "knowledge.json");
    const bundle = JSON.parse(fs.readFileSync(file, "utf8")) as KnowledgeBundle;
    return new Knowledge(bundle, tools);
  }

  get classes(): Record<string, OntClass> {
    return this.bundle.ontology.classes;
  }

  get fdsGroups(): Record<string, FdsGroup> {
    return this.bundle.fds.groups;
  }

  domains(): string[] {
    return [...new Set(this.rules.map((r) => r.domain))].sort();
  }

  /** Raw text of a packaged knowledge file (README, YAML, playbook, example). */
  readFile(relPath: string): string {
    return fs.readFileSync(pkgPath(relPath), "utf8");
  }

  rulesForTool(tool: string): Rule[] {
    return (this.bundle.toolRules[tool] ?? []).map((id) => this.ruleById.get(id)).filter((r): r is Rule => !!r);
  }

  private buildDocs(tools: ToolDoc[]): SearchDoc[] {
    const docs: SearchDoc[] = [];
    for (const r of this.rules) {
      docs.push({
        id: r.id,
        kind: "rule",
        domain: r.domain,
        title: `${r.title} / ${r.title_en}`,
        text: [r.condition, r.check?.how, r.fix?.how, (r.check?.tools ?? []).join(" "), (r.fix?.tools ?? []).join(" "), r.applies_to.join(" ")].filter(Boolean).join("\n"),
        uri: `bulc://knowledge/rule/${r.id}`,
        extra: { severity: r.severity, confidence: r.confidence },
      });
    }
    for (const m of this.bundle.mistakes) {
      docs.push({ id: m.id, kind: "mistake", title: m.mistake, text: `${m.consequence}\n${m.correct}\n${m.rules.join(" ")}`, uri: `bulc://knowledge/rules#${m.id}`, extra: { rules: m.rules } });
    }
    for (const [name, c] of Object.entries(this.classes)) {
      const tools = Object.values(c.tools ?? {}).flat().join(" ");
      docs.push({
        id: name,
        kind: "class",
        title: `${c.label?.ko ?? ""} / ${c.label?.en ?? name}`,
        text: [c.description, (c.fds ?? []).join(" "), Object.keys(c.properties ?? {}).join(" "), tools].filter(Boolean).join("\n"),
        uri: `bulc://knowledge/class/${name}`,
        extra: { rules: c.rules ?? [] },
      });
    }
    for (const p of this.bundle.playbooks) {
      p.sections.forEach((s, i) => {
        docs.push({ id: `${p.id}#${i}`, kind: "playbook", title: `${p.title} — ${s.heading}`, text: s.text, uri: `bulc://knowledge/playbooks/${p.slug}`, extra: { playbook: p.slug } });
      });
    }
    this.bundle.glossary.forEach((g, i) => {
      docs.push({ id: `glossary-${i + 1}`, kind: "glossary", title: g.cells[0] ?? "", text: `${g.section}\n${g.text}`, uri: "bulc://knowledge/glossary" });
    });
    for (const [group, g] of Object.entries(this.fdsGroups)) {
      for (const [key, k] of Object.entries(g.keys)) {
        docs.push({
          id: `${group}.${key}`,
          kind: "fds_key",
          title: `&${group} ${key}`,
          text: [k.en, k.ko, k.unit, k.type, (k.mistakes ?? []).join("\n"), (g.tools ?? []).join(" "), g.title?.en, g.title?.ko].filter(Boolean).join("\n"),
          uri: `bulc://knowledge/fds-6.10.1/namelist/${group}`,
          extra: { default: k.default, rules: k.rules ?? [] },
        });
      }
    }
    for (const e of this.bundle.fds.errors) {
      docs.push({ id: `FDS-ERROR-${e.code}`, kind: "fds_error", title: `FDS ERROR(${e.code})`, text: `${e.en}\n${e.ko}\nERROR(${e.code}) ${e.code}`, uri: "bulc://knowledge/fds-6.10.1/keys", extra: { rules: e.rules ?? [] } });
    }
    for (const t of tools) {
      docs.push({ id: t.name, kind: "tool", title: t.name, text: t.description, uri: `bulc://tools/${t.name}`, domain: undefined, extra: { category: t.category } });
    }
    return docs;
  }
}
