// Shallow JSON-schema check of planned tool arguments (top level only). The app validates calls
// itself; this exists so bulc_plan_check can catch wrong argument names before anything runs.

export interface SchemaIssue {
  kind: "missing" | "unknown" | "type" | "enum";
  key: string;
  message: string;
}

export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function closest(name: string, candidates: Iterable<string>, max = 3): string[] {
  const n = name.toLowerCase();
  const scored: { c: string; s: number }[] = [];
  for (const c of candidates) {
    const cl = c.toLowerCase();
    let s = editDistance(n, cl);
    if (cl.includes(n) || n.includes(cl)) s = Math.min(s, 1.5);
    const parts = n.split(/[_\s]+/).filter((p) => p.length > 2);
    if (parts.length && parts.every((p) => cl.includes(p))) s = Math.min(s, 2);
    scored.push({ c, s });
  }
  const limit = Math.max(2, Math.ceil(n.length / 3));
  return scored
    .filter((x) => x.s <= limit)
    .sort((a, b) => a.s - b.s)
    .slice(0, max)
    .map((x) => x.c);
}

const typeOf = (v: unknown): string => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);

function typeOk(expected: unknown, v: unknown): boolean {
  if (!expected) return true;
  const list = Array.isArray(expected) ? expected : [expected];
  const actual = typeOf(v);
  return list.some((t) => t === actual || (t === "number" && actual === "integer"));
}

export function checkArgs(schema: Record<string, unknown> | undefined, args: Record<string, unknown>): SchemaIssue[] {
  if (!schema || typeof schema !== "object") return [];
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const issues: SchemaIssue[] = [];
  for (const r of required) {
    if (args[r] === undefined) issues.push({ kind: "missing", key: r, message: `required argument '${r}' is missing` });
  }
  const names = Object.keys(props);
  for (const [k, v] of Object.entries(args)) {
    const p = props[k];
    if (!p) {
      if (names.length) {
        const near = closest(k, names, 2);
        issues.push({ kind: "unknown", key: k, message: `no argument '${k}'${near.length ? ` — did you mean ${near.map((x) => `'${x}'`).join(" or ")}?` : ""}` });
      }
      continue;
    }
    if (!typeOk(p.type, v)) issues.push({ kind: "type", key: k, message: `'${k}' should be ${JSON.stringify(p.type)}, got ${typeOf(v)}` });
    if (Array.isArray(p.enum) && v !== undefined && !(p.enum as unknown[]).includes(v))
      issues.push({ kind: "enum", key: k, message: `'${k}' must be one of ${(p.enum as unknown[]).map((x) => JSON.stringify(x)).join(", ")}` });
  }
  return issues;
}
