// MCP prompts built from prompts/prompts.yaml (compiled into build/knowledge.json).
import type { Knowledge } from "./store.js";
import type { Rule } from "./types.js";

export function listPrompts(k: Knowledge) {
  return k.bundle.prompts.map((p) => ({
    name: p.name,
    title: `${p.title.ko} / ${p.title.en}`,
    description: p.description,
    arguments: p.arguments.map((a) => ({ name: a.name, description: a.description, required: !!a.required })),
  }));
}

export function getPrompt(k: Knowledge, name: string, args: Record<string, string> = {}) {
  const p = k.promptByName.get(name);
  if (!p) throw new Error(`unknown prompt ${name}`);
  for (const a of p.arguments) {
    if (a.required && !String(args[a.name] ?? "").trim()) throw new Error(`prompt ${name}: argument '${a.name}' is required`);
  }
  const body = p.template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => {
    const v = String(args[key] ?? "").trim();
    return v || "(미지정 / not given)";
  });
  const pb = p.playbook ? k.playbookBySlug.get(p.playbook) : undefined;
  const ruleIds = new Set<string>([...p.rules, ...(pb?.rules ?? [])]);
  const rules = [...ruleIds]
    .map((id) => k.ruleById.get(id))
    .filter((r): r is Rule => !!r && r.severity !== "info")
    .sort((a, b) => (a.severity === b.severity ? a.id.localeCompare(b.id) : a.severity === "error" ? -1 : 1));
  const parts = [body.trim()];
  if (rules.length) {
    parts.push(
      "",
      "## 지킬 규칙 / Rules to follow (error, warning)",
      ...rules.map((r) => `- ${r.id} [${r.severity}] ${r.title} / ${r.title_en}${r.fix?.how ? ` — ${r.fix.how}` : ""}`),
    );
  }
  if (pb) {
    parts.push("", `## 플레이북 / Playbook — bulc://knowledge/playbooks/${pb.slug}`, "", k.readFile(pb.file).trim());
  }
  return {
    description: `${p.title.ko} / ${p.title.en}`,
    messages: [{ role: "user" as const, content: { type: "text" as const, text: parts.join("\n") } }],
  };
}
