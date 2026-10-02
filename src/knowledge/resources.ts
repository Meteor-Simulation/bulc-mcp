// MCP resources: the knowledge pack, synthetic examples, per-rule/class/key views, and two live
// views of the project open in the app.
import { BridgeError, type BridgeClient } from "../bridge.js";
import type { Catalog } from "../catalog.js";
import type { Knowledge } from "./store.js";

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

const LIVE = [
  { uri: "bulc://project/summary", name: "project-summary", title: "현재 프로젝트 요약 / Current project summary (live)", mimeType: "application/json", description: "Summary of the project open in the BULC app. Needs the app." },
  { uri: "bulc://project/deck", name: "project-deck", title: "현재 FDS 덱 / Current FDS deck (live)", mimeType: "text/plain", description: "The FDS deck of the project open in the BULC app (preview_fds). Needs the app." },
];

export function listResources(k: Knowledge) {
  return [
    ...k.bundle.files.map((f) => ({ uri: f.uri, name: f.name, title: f.title, description: f.description, mimeType: f.mimeType })),
    ...LIVE,
  ];
}

export function listResourceTemplates() {
  return [
    { uriTemplate: "bulc://knowledge/rule/{id}", name: "rule", title: "규칙 하나 / One rule", description: "One rule by id, e.g. FIRE-001", mimeType: "application/json" },
    { uriTemplate: "bulc://knowledge/rules/{domain}", name: "rules-by-domain", title: "영역별 규칙 / Rules of one domain", description: "Rules of one domain, e.g. sprinkler", mimeType: "application/json" },
    { uriTemplate: "bulc://knowledge/class/{name}", name: "ontology-class", title: "온톨로지 클래스 / Ontology class", description: "One ontology class, e.g. Mesh, Nozzle", mimeType: "application/json" },
    { uriTemplate: "bulc://knowledge/fds-6.10.1/namelist/{group}", name: "fds-namelist", title: "FDS namelist 키 / FDS namelist keys", description: "Key reference of one FDS 6.10.1 namelist group, e.g. PROP", mimeType: "application/json" },
    { uriTemplate: "bulc://tools/{name}", name: "tool", title: "도구 설명 / Tool card", description: "One app tool: description, input schema, annotations and related rules", mimeType: "text/markdown" },
  ];
}

const json = (uri: string, data: unknown): ResourceContent => ({ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) });

export async function readResource(uri: string, k: Knowledge, catalog: Catalog, bridge: BridgeClient): Promise<ResourceContent> {
  const file = k.fileByUri.get(uri);
  if (file) return { uri, mimeType: file.mimeType, text: k.readFile(file.path) };

  let m = uri.match(/^bulc:\/\/knowledge\/rule\/([A-Za-z]+-\d{3})$/);
  if (m) {
    const r = k.ruleById.get(m[1].toUpperCase());
    if (!r) throw new Error(`unknown rule ${m[1]}`);
    return json(uri, { ...r, mistakes: k.bundle.mistakes.filter((x) => x.rules.includes(r.id)) });
  }
  m = uri.match(/^bulc:\/\/knowledge\/rules\/([a-z_]+)$/);
  if (m) {
    const rules = k.rules.filter((r) => r.domain === m![1]);
    if (!rules.length) throw new Error(`unknown domain ${m[1]} (domains: ${k.domains().join(", ")})`);
    return json(uri, rules);
  }
  m = uri.match(/^bulc:\/\/knowledge\/class\/([A-Za-z]+)$/);
  if (m) {
    const name = Object.keys(k.classes).find((c) => c.toLowerCase() === m![1].toLowerCase());
    if (!name) throw new Error(`unknown class ${m[1]}`);
    return json(uri, { name, ...k.classes[name], rulesText: (k.classes[name].rules ?? []).map((id) => k.ruleById.get(id)).filter(Boolean) });
  }
  m = uri.match(/^bulc:\/\/knowledge\/fds-6\.10\.1\/namelist\/&?([A-Za-z]+)$/);
  if (m) {
    const g = k.fdsGroups[m[1].toUpperCase()];
    if (!g) throw new Error(`no key reference for &${m[1]} (groups: ${Object.keys(k.fdsGroups).join(", ")})`);
    return json(uri, { group: m[1].toUpperCase(), fds_version: k.bundle.fdsVersion, ...g });
  }
  m = uri.match(/^bulc:\/\/tools\/([a-z][a-z0-9_]*)$/);
  if (m) {
    const t = await catalog.findAppTool(m[1]);
    const local = catalog.localDefs().find((d) => d.name === m![1]);
    const def = local ?? (t ? catalog.decorate(t) : undefined);
    if (!def) throw new Error(`unknown tool ${m[1]}`);
    const rules = k.rulesForTool(def.name);
    const classes = Object.entries(k.classes)
      .filter(([, c]) => Object.values(c.tools ?? {}).some((names) => names.includes(def.name)))
      .map(([n]) => n);
    const md = [
      `# ${def.name}`,
      "",
      def.description,
      "",
      `annotations: ${JSON.stringify(def.annotations ?? {})}`,
      classes.length ? `ontology classes: ${classes.join(", ")}` : "",
      rules.length ? `\n## Related rules\n${rules.map((r) => `- ${r.id} [${r.severity}] ${r.title_en} — ${r.title}`).join("\n")}` : "",
      "\n## inputSchema\n```json",
      JSON.stringify(def.inputSchema, null, 2),
      "```",
    ]
      .filter((x) => x !== "")
      .join("\n");
    return { uri, mimeType: "text/markdown", text: md };
  }
  if (uri === "bulc://project/summary") {
    try {
      return json(uri, await bridge.fetchSummary());
    } catch (err) {
      throw new Error(err instanceof BridgeError ? err.message : String(err));
    }
  }
  if (uri === "bulc://project/deck") {
    try {
      const r = await bridge.callTool("preview_fds", { max_lines: 1_000_000 }, 60_000);
      return { uri, mimeType: "text/plain", text: r.message };
    } catch (err) {
      throw new Error(err instanceof BridgeError ? err.message : String(err));
    }
  }
  throw new Error(`unknown resource ${uri}`);
}
