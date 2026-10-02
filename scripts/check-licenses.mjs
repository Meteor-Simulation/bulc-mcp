// Fail if any installed dependency (runtime or dev) carries a copyleft or source-available licence
// that is incompatible with distributing this MIT package: GPL, AGPL, LGPL, SSPL, EUPL, OSL, CC-BY-SA, etc.
//
//   node scripts/check-licenses.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/knowledge-source.mjs";

const DENY = /\b(A?GPL|LGPL|SSPL|EUPL|OSL|CPAL|RPL|Sleepycat|CC-BY-SA|CC-BY-NC|BUSL|Commons-Clause)\b/i;
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
const counts = {};
const bad = [];
for (const [p, meta] of Object.entries(lock.packages ?? {})) {
  if (!p) continue; // the root package
  let lic = meta.license;
  if (!lic) {
    try {
      lic = JSON.parse(fs.readFileSync(path.join(ROOT, p, "package.json"), "utf8")).license;
    } catch {
      lic = undefined;
    }
  }
  const name = typeof lic === "object" && lic ? lic.type : lic;
  const key = name ?? "UNKNOWN";
  counts[key] = (counts[key] ?? 0) + 1;
  if (!name || DENY.test(String(name))) bad.push(`${p.replace(/^node_modules\//, "")}: ${key}`);
}
console.log("licences:", Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
if (bad.length) {
  console.error("not allowed or unknown licence:\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log("check-licenses: ok");
