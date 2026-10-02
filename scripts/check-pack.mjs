// Check what `npm pack` would publish: the build, the knowledge pack and the docs — never src/, test/,
// scripts/ or project/result files.
//
//   node scripts/check-pack.mjs
import { execSync } from "node:child_process";
import { ROOT } from "./lib/knowledge-source.mjs";

const out = execSync("npm pack --dry-run --json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
// lifecycle scripts (prepare → build) may print before the JSON array
const start = out.search(/^\[\s*$/m);
const files = JSON.parse(start >= 0 ? out.slice(start) : out)[0].files.map((f) => f.path);
const bad = files.filter((p) => /^(src|test|scripts|\.github)\//.test(p) || /\.(bulc|smv|tgz|mcpb|env)$/i.test(p));
const required = ["build/server.js", "build/knowledge.json", "build/tools-snapshot.json", "knowledge/rules.yaml", "knowledge/ontology.yaml", "prompts/prompts.yaml", "LICENSE", "README.md", "PRIVACY_POLICY.md"];
const missing = required.filter((r) => !files.includes(r));
console.log(`check-pack: ${files.length} files`);
if (bad.length) console.error("unexpected files in the package:", bad);
if (missing.length) console.error("missing from the package:", missing);
process.exit(bad.length || missing.length ? 1 : 0);
