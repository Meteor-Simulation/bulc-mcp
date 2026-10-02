import type { Rule } from "../knowledge/types.js";
import { SEVERITY_RANK, type Knowledge } from "../knowledge/store.js";
import { text } from "../results.js";
import { argNumber, argString, obj, readOnly, type LocalTool } from "./types.js";

const KINDS = ["rule", "mistake", "class", "playbook", "glossary", "fds_key", "fds_error", "tool"];

const clip = (s: string | undefined, n: number): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function formatRule(r: Rule, full = false): string {
  const head = `${r.id} [${r.severity} · ${r.domain} · ${r.confidence}] ${r.title} / ${r.title_en}`;
  if (!full) return head;
  const lines = [head, `  applies to: ${r.applies_to.join(", ")}`, `  condition: ${r.condition}`];
  if (r.check?.tools?.length || r.check?.how) lines.push(`  check: ${[r.check?.tools?.join(", "), r.check?.how].filter(Boolean).join(" — ")}`);
  if (r.fix?.tools?.length || r.fix?.how) lines.push(`  fix: ${[r.fix?.tools?.join(", "), r.fix?.how].filter(Boolean).join(" — ")}`);
  if (r.confidence === "regulatory_verify") lines.push("  ⚠ 법규 힌트 — 적용 시점의 원문과 발주처 요구로 확인하세요 / regulatory hint: verify against the current code text.");
  if (r.confidence === "engine_snapshot") lines.push("  ⚠ 엔진 지원 범위(시점 기준) — 실행 로그 경고도 확인하세요 / engine-scope note: also check the run log.");
  lines.push(`  → bulc://knowledge/rule/${r.id}`);
  return lines.join("\n");
}

function exactLookup(k: Knowledge, q: string): string | null {
  const id = q.trim();
  const up = id.toUpperCase();
  const rule = k.ruleById.get(up);
  if (rule) {
    const mistakes = k.bundle.mistakes.filter((m) => m.rules.includes(rule.id));
    const out = [formatRule(rule, true)];
    if (mistakes.length) out.push("", "흔한 실수 / common mistakes:", ...mistakes.map((m) => `  ${m.id}: ${m.mistake} → ${m.correct}`));
    return out.join("\n");
  }
  const mistake = k.mistakeById.get(up);
  if (mistake) {
    const rules = mistake.rules.map((r) => k.ruleById.get(r)).filter((r): r is Rule => !!r);
    return [`${mistake.id}: ${mistake.mistake}`, `  consequence: ${mistake.consequence}`, `  correct: ${mistake.correct}`, "", ...rules.map((r) => formatRule(r, true))].join("\n");
  }
  const cls = Object.entries(k.classes).find(([name]) => name.toLowerCase() === id.toLowerCase());
  if (cls) return `${cls[0]} — ontology class\n${JSON.stringify(cls[1], null, 2)}\n→ bulc://knowledge/class/${cls[0]}`;
  const fdsKey = up.match(/^&?([A-Z]+)[ .]([A-Z_0-9]+)$/);
  if (fdsKey) {
    const g = k.fdsGroups[fdsKey[1]];
    const key = g?.keys[fdsKey[2]];
    if (key) return `&${fdsKey[1]} ${fdsKey[2]} (FDS 6.10.1)\n${JSON.stringify(key, null, 2)}\nBULC tools: ${(g.tools ?? []).join(", ")}`;
  }
  const grp = k.fdsGroups[up.replace(/^&/, "")];
  if (grp) return `&${up.replace(/^&/, "")} (FDS 6.10.1) — ${grp.title?.en ?? ""} / ${grp.title?.ko ?? ""}\nBULC tools: ${(grp.tools ?? []).join(", ")}\nkeys: ${Object.keys(grp.keys).join(", ")}\n→ bulc://knowledge/fds-6.10.1/namelist/${up.replace(/^&/, "")}`;
  const err = up.match(/^(?:FDS[- ]?)?ERROR\s*\(?(\d+)\)?$/);
  if (err) {
    const e = k.bundle.fds.errors.find((x) => x.code === Number(err[1]));
    if (e) return `FDS ERROR(${e.code}): ${e.en}\n${e.ko}\nrules: ${(e.rules ?? []).join(", ")}`;
  }
  return null;
}

export const knowledgeSearch: LocalTool = {
  def: {
    name: "bulc_knowledge_search",
    title: "Search BULC knowledge",
    description:
      "Search the bundled BULC knowledge pack — modelling rules (condition → check → fix), common LLM mistakes, ontology classes " +
      "(units, coordinates, which tool creates what), playbook steps, glossary (Korean ↔ English ↔ FDS keyword ↔ tool), FDS 6.10.1 " +
      "key reference and FDS input errors. Pass a rule id (e.g. FIRE-001), a class (Mesh), an FDS key (MESH.IJK), an error " +
      "(ERROR 314) or free text in Korean or English. Works without the app. 지식 팩 검색(규칙 id·키워드).",
    inputSchema: obj({
      query: { type: "string", description: "Rule id, class name, FDS key, error number or free text (ko/en)" },
      kinds: { type: "array", items: { type: "string", enum: KINDS }, description: "Restrict to these kinds" },
      domain: { type: "string", description: "Rule domain filter (general, geometry, mesh, boundary, fire, surface, device, output, simulation, evacuation, hvac, sprinkler, aset, drawing, troubleshooting)" },
      limit: { type: "number", description: "Maximum results (default 8, max 30)" },
    }, ["query"]),
    annotations: { title: "Search BULC knowledge", ...readOnly },
  },
  async run(args, ctx) {
    const q = argString(args, "query");
    if (!q) return text("query 가 필요합니다 / query is required.", true);
    const exact = exactLookup(ctx.knowledge, q);
    const kinds = Array.isArray(args.kinds) ? (args.kinds as unknown[]).map(String).filter((x) => KINDS.includes(x)) : undefined;
    const limit = Math.min(30, Math.max(1, Math.floor(argNumber(args, "limit") ?? 8)));
    const hits = ctx.knowledge.index.search(q, { kinds, domain: argString(args, "domain"), limit });
    const out: string[] = [];
    if (exact) out.push(exact, "");
    if (!hits.length && !exact) {
      return text(
        `"${q}" 에 맞는 항목이 없습니다. 다른 낱말(한국어/영어)이나 규칙 id 로 다시 찾아보세요. 영역: ${ctx.knowledge.domains().join(", ")}\n` +
          `No match for "${q}". Try other words or a rule id. Domains: ${ctx.knowledge.domains().join(", ")}`,
      );
    }
    if (hits.length) out.push(`검색 결과 / results for "${q}" (${hits.length}):`);
    hits.forEach((h, i) => {
      const d = h.doc;
      const sev = d.extra?.severity ? ` · ${String(d.extra.severity)}` : "";
      const dom = d.domain ? ` · ${d.domain}` : "";
      out.push(`${i + 1}. [${d.kind}${sev}${dom}] ${d.id} — ${clip(d.title, 140)}`);
      out.push(`   ${clip(d.text, 240)}`);
      out.push(`   → ${d.uri}`);
    });
    return text(out.join("\n"));
  },
};

export const getRules: LocalTool = {
  def: {
    name: "bulc_get_rules",
    title: "Get BULC rules",
    description:
      "List modelling rules filtered by domain, severity, class (applies_to), confidence, or the tool they mention. Use before a " +
      "phase of work (e.g. domain=sprinkler, min_severity=warning) and quote rule ids when explaining. Works without the app. " +
      "규칙을 영역·심각도·도구별로 가져옵니다.",
    inputSchema: obj({
      domain: { type: "string", description: "general | geometry | mesh | boundary | fire | surface | device | output | simulation | evacuation | hvac | sprinkler | aset | drawing | troubleshooting" },
      severity: { type: "string", enum: ["error", "warning", "info"], description: "Exactly this severity" },
      min_severity: { type: "string", enum: ["error", "warning", "info"], description: "This severity or worse (error > warning > info)" },
      ids: { type: "array", items: { type: "string" }, description: "Specific rule ids" },
      applies_to: { type: "string", description: "Ontology class, e.g. Mesh, Fire, Nozzle" },
      confidence: { type: "string", enum: ["verified", "convention", "guidance", "regulatory_verify", "engine_snapshot"] },
      tool: { type: "string", description: "Rules that name this tool in check/fix" },
      format: { type: "string", enum: ["summary", "full"], description: "summary (default): one line per rule; full: condition, check, fix" },
      limit: { type: "number", description: "Maximum rules (default 40)" },
    }),
    annotations: { title: "Get BULC rules", ...readOnly },
  },
  async run(args, ctx) {
    const k = ctx.knowledge;
    let rules = k.rules.slice();
    const domain = argString(args, "domain");
    const severity = argString(args, "severity");
    const min = argString(args, "min_severity") as keyof typeof SEVERITY_RANK | undefined;
    const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map((x) => String(x).toUpperCase()) : undefined;
    const cls = argString(args, "applies_to");
    const conf = argString(args, "confidence");
    const tool = argString(args, "tool");
    if (domain) rules = rules.filter((r) => r.domain === domain);
    if (severity) rules = rules.filter((r) => r.severity === severity);
    if (min && min in SEVERITY_RANK) rules = rules.filter((r) => SEVERITY_RANK[r.severity] <= SEVERITY_RANK[min]);
    if (ids?.length) rules = rules.filter((r) => ids.includes(r.id));
    if (cls) rules = rules.filter((r) => r.applies_to.includes(cls) || r.applies_to.includes("all"));
    if (conf) rules = rules.filter((r) => r.confidence === conf);
    if (tool) {
      const linked = new Set(k.bundle.toolRules[tool] ?? []);
      rules = rules.filter((r) => linked.has(r.id));
    }
    rules.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id));
    const limit = Math.max(1, Math.floor(argNumber(args, "limit") ?? 40));
    const total = rules.length;
    rules = rules.slice(0, limit);
    const full = argString(args, "format") === "full";
    if (!total) {
      const counts = k.domains().map((d) => `${d} ${k.rules.filter((r) => r.domain === d).length}`).join(", ");
      return text(`조건에 맞는 규칙이 없습니다 / no rules match. Domains: ${counts}`);
    }
    const head = `규칙 ${total}건${total > rules.length ? ` 중 ${rules.length}건` : ""} / ${total} rule(s)${total > rules.length ? `, showing ${rules.length}` : ""}:`;
    return text([head, ...rules.map((r) => formatRule(r, full))].join(full ? "\n\n" : "\n"));
  },
};

export { clip };
