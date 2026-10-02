import type { BridgeClient } from "../bridge.js";
import type { Catalog, ToolDef } from "../catalog.js";
import type { Config } from "../config.js";
import type { Knowledge } from "../knowledge/store.js";
import type { ToolResult } from "../results.js";

export interface Ctx {
  cfg: Config;
  bridge: BridgeClient;
  catalog: Catalog;
  knowledge: Knowledge;
  version: string;
  /** Forward a call to the app and convert the reply (handles connection errors). */
  forward(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface LocalTool {
  def: ToolDef;
  /** Profiles that list this tool (default: both). */
  profiles?: ("full" | "compact")[];
  run(args: Record<string, unknown>, ctx: Ctx): Promise<ToolResult>;
}

export const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function argString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function argNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function argBool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
