// Where things live at run time.
//
//   <package root>/build/server.js         ← compiled entry point (this file compiles to build/paths.js)
//   <package root>/build/knowledge.json    ← knowledge compiled from YAML/Markdown at build time
//   <package root>/build/tools-snapshot.json
//   <package root>/knowledge/, prompts/, examples/  ← raw files served as MCP resources
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(BUILD_DIR, "..");

export function pkgPath(...parts: string[]): string {
  return path.join(PKG_ROOT, ...parts);
}

export function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath("package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
