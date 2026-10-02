// Tool discovery and generic call — for clients with a tool-count limit (BULC_MCP_PROFILE=compact)
// and for finding the right app tool by keyword in either profile.
import { SearchIndex, type SearchDoc } from "../knowledge/search.js";
import { text } from "../results.js";
import { argNumber, argString, obj, readOnly, type LocalTool } from "./types.js";

export const findTools: LocalTool = {
  def: {
    name: "bulc_find_tools",
    title: "Find BULC app tools",
    description:
      "Find BULC app tools by keyword (Korean or English) or category and return their names, descriptions and full input schemas. " +
      "Categories: project (open/save/run/results/ASET/screenshots), arch (floor-plan drawings), geometry, fire, ventilation, device, mesh, material, " +
      "surface, output, query, evac, spr, hvac, draw, furniture, result, shape. " +
      "In the compact profile, call the tool you found with bulc_call. 키워드로 앱 도구를 찾습니다.",
    inputSchema: obj({
      query: { type: "string", description: "What you want to do, e.g. 'add a sprinkler head', '연기 감지기', 'slice output'" },
      category: { type: "string", description: "Restrict to one category" },
      names: { type: "array", items: { type: "string" }, description: "Return exactly these tools" },
      limit: { type: "number", description: "Maximum tools (default 6, max 25)" },
    }),
    annotations: { title: "Find BULC app tools", ...readOnly },
  },
  async run(args, ctx) {
    const { tools, live } = await ctx.catalog.appTools();
    const limit = Math.min(25, Math.max(1, Math.floor(argNumber(args, "limit") ?? 6)));
    const category = argString(args, "category");
    const names = Array.isArray(args.names) ? (args.names as unknown[]).map(String) : [];
    let picked = tools.filter((t) => !category || ctx.catalog.categoryOf(t) === category);
    if (names.length) picked = picked.filter((t) => names.includes(t.name));
    else {
      const q = argString(args, "query");
      if (q) {
        const docs: SearchDoc[] = picked.map((t) => ({ id: t.name, kind: "tool", title: t.name.replace(/_/g, " "), text: t.description, uri: `bulc://tools/${t.name}` }));
        const hits = new SearchIndex(docs).search(q, { limit });
        const order = hits.map((h) => h.doc.id);
        picked = order.map((n) => picked.find((t) => t.name === n)!).filter(Boolean);
      } else picked = picked.slice(0, limit);
    }
    if (!picked.length) return text(`맞는 도구가 없습니다 / no matching tools (${tools.length} tools, ${live ? "live" : "snapshot"}).`);
    const blocks = picked.slice(0, limit).map((t) => {
      const rules = ctx.knowledge.rulesForTool(t.name).slice(0, 3).map((r) => r.id);
      return [
        `## ${t.name}  [${ctx.catalog.categoryOf(t) ?? "?"}]`,
        t.description,
        rules.length ? `rules: ${rules.join(", ")}` : "",
        "inputSchema:",
        JSON.stringify(t.inputSchema),
      ]
        .filter(Boolean)
        .join("\n");
    });
    return text(`${picked.length} tool(s) from ${live ? "the live app" : "the bundled snapshot"}:\n\n${blocks.join("\n\n")}`);
  },
};

export const callTool: LocalTool = {
  profiles: ["compact"],
  def: {
    name: "bulc_call",
    title: "Call a BULC app tool",
    description:
      "Call any BULC app tool by name with its arguments (compact profile). Look the tool and its schema up with bulc_find_tools first; " +
      "check multi-step plans with bulc_plan_check. 이름으로 앱 도구를 호출합니다.",
    inputSchema: obj(
      {
        name: { type: "string", description: "App tool name, e.g. add_wall" },
        args: { type: "object", description: "Arguments exactly as in the tool's inputSchema" },
      },
      ["name"],
    ),
    annotations: { title: "Call a BULC app tool", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async run(args, ctx) {
    const name = argString(args, "name");
    if (!name) return text("name 이 필요합니다 / name is required.", true);
    const a = args.args && typeof args.args === "object" && !Array.isArray(args.args) ? (args.args as Record<string, unknown>) : {};
    return ctx.forward(name, a);
  },
};
