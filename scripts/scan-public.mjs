// Scan every file that would be published (tracked + untracked, not ignored) for generic
// sensitive patterns: user-profile paths, e-mail addresses, keys and tokens, phone numbers.
//
//   node scripts/scan-public.mjs            → exit 1 on any hit
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/knowledge-source.mjs";
import { scanText } from "./lib/public-patterns.mjs";

const SKIP = [/^node_modules\//, /^build\//, /^package-lock\.json$/, /\.(png|jpg|jpeg|ico|gif|pdf|zip|mcpb|tgz)$/i];

function listFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" });
    return out.split("\0").filter(Boolean);
  } catch {
    // not a git checkout (e.g. an npm tarball): walk the tree
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".git" && e.name !== "build") walk(p);
        } else files.push(p);
      }
    };
    walk("");
    return files;
  }
}

let total = 0;
const files = listFiles().filter((f) => !SKIP.some((re) => re.test(f)));
for (const f of files) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, "utf8");
  for (const h of scanText(text)) {
    total++;
    console.log(`${f}:${h.line}  [${h.id}] ${h.why}: ${h.match}`);
  }
}
console.log(`scan-public: ${files.length} files, ${total} finding(s)`);
process.exit(total ? 1 : 0);
