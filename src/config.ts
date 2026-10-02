// Runtime configuration — environment variables only, read once at start-up.
//
//   BULC_BRIDGE_URL              full bridge URL (wins over everything else), e.g. http://127.0.0.1:8790
//   (discovery file)             the app writes BULC/bridge.json {url, port, token, pid …} in the user's config folder
//                                (Windows %APPDATA%, macOS ~/Library/Application Support, Linux $XDG_CONFIG_HOME or ~/.config);
//                                used when BULC_BRIDGE_URL is not set — the server finds the app's port and token by itself
//   BULC_BRIDGE_DISCOVERY_FILE   another path for that file, or 0 to ignore it
//   BULC_BRIDGE_TOKEN            bridge token (Authorization: Bearer) when the app runs with BULC_BRIDGE_AUTH=sensitive|all and
//                                there is no discovery file (the discovery file carries its own token)
//   BULC_BRIDGE_HOST / _PORT     fallback address when there is no discovery file (default 127.0.0.1:8787)
//   BULC_MCP_ALLOW_REMOTE=1      allow a non-loopback bridge host (off by default)
//   BULC_MCP_PROFILE             full (default) | compact
//   BULC_MCP_TOOLSETS            comma list of app tool categories to expose (full profile)
//   BULC_MCP_HIDE_TOOLS          comma list of tool names to hide
//   BULC_MCP_HINTS=0             do not append rule-id hints to app tool descriptions
//   BULC_MCP_MAX_DESCRIPTION     truncate tool descriptions to this many characters (e.g. 1024 for clients with that limit)
//   BULC_MCP_CALL_TIMEOUT_MS     timeout of one app tool call (default 120000)
//   BULC_MCP_WATCH_MS            connection watch interval while the app is not connected (default 15000, 0 = off)
//   BULC_MCP_ATTACH_IMAGES=0     do not attach screenshots (capture_view, shape_screenshot) as image content
import os from "node:os";
import path from "node:path";

export type Profile = "full" | "compact";

export interface Config {
  /** Fallback bridge URL (BULC_BRIDGE_URL, or BULC_BRIDGE_HOST/PORT, or the default). */
  bridgeUrl: string;
  bridgeHost: string;
  bridgePort: number;
  /** BULC_BRIDGE_URL was given — the discovery file is not consulted. */
  explicitUrl: boolean;
  /** Path of the app's discovery file, or null when disabled. */
  discoveryFile: string | null;
  /** BULC_BRIDGE_TOKEN */
  token: string | null;
  allowRemote: boolean;
  profile: Profile;
  toolsets: Set<string> | null;
  hideTools: Set<string>;
  hints: boolean;
  maxDescription: number | null;
  healthTimeoutMs: number;
  toolsTimeoutMs: number;
  callTimeoutMs: number;
  longCallTimeoutMs: number;
  watchMs: number;
  watchConnectedMs: number;
  attachImages: boolean;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;
/** Many clients (and some model APIs) cap a tool description at 1,024 characters; rule hints never push past it. */
export const DESCRIPTION_SOFT_LIMIT = 1024;

const list = (v: string | undefined): Set<string> | null => {
  const items = (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
};

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const flag = (v: string | undefined, fallback: boolean): boolean => {
  if (v === undefined || v.trim() === "") return fallback;
  return !/^(0|false|no|off)$/i.test(v.trim());
};

export function resolveBridgeUrl(env: NodeJS.ProcessEnv): { url: string; host: string; port: number; explicit: boolean } {
  const explicit = env.BULC_BRIDGE_URL?.trim();
  if (explicit) {
    const url = explicit.replace(/\/+$/, "");
    try {
      const u = new URL(url);
      const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
      return { url, host: u.hostname, port, explicit: true };
    } catch {
      return { url, host: "", port: 0, explicit: true };
    }
  }
  const host = env.BULC_BRIDGE_HOST?.trim() || DEFAULT_HOST;
  const port = Number(env.BULC_BRIDGE_PORT?.trim()) || DEFAULT_PORT;
  const hostPart = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return { url: `http://${hostPart}:${port}`, host, port, explicit: false };
}

/** Where the BULC app writes its discovery file (same rule as the app). null = disabled. */
export function discoveryPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const v = env.BULC_BRIDGE_DISCOVERY_FILE?.trim();
  if (v === "0") return null;
  if (v) return path.resolve(v);
  const home = os.homedir();
  const base =
    platform === "win32"
      ? env.APPDATA || path.join(home, "AppData", "Roaming")
      : platform === "darwin"
        ? path.join(home, "Library", "Application Support")
        : env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(base, "BULC", "bridge.json");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bridge = resolveBridgeUrl(env);
  const profile: Profile = (env.BULC_MCP_PROFILE ?? "").trim().toLowerCase() === "compact" ? "compact" : "full";
  const maxDesc = num(env.BULC_MCP_MAX_DESCRIPTION, 0);
  // an unresolved extension template such as "${user_config.bridge_token}" counts as "not set"
  const rawToken = env.BULC_BRIDGE_TOKEN?.trim();
  const token = rawToken && !/^\$\{.*\}$/.test(rawToken) ? rawToken : undefined;
  return {
    bridgeUrl: bridge.url,
    bridgeHost: bridge.host,
    bridgePort: bridge.port,
    explicitUrl: bridge.explicit,
    discoveryFile: bridge.explicit ? null : discoveryPath(env),
    token: token ? token : null,
    allowRemote: flag(env.BULC_MCP_ALLOW_REMOTE, false),
    profile,
    toolsets: list(env.BULC_MCP_TOOLSETS),
    hideTools: list(env.BULC_MCP_HIDE_TOOLS) ?? new Set(),
    hints: flag(env.BULC_MCP_HINTS, true),
    maxDescription: maxDesc >= 80 ? Math.floor(maxDesc) : null,
    healthTimeoutMs: 1500,
    toolsTimeoutMs: 6000,
    callTimeoutMs: num(env.BULC_MCP_CALL_TIMEOUT_MS, 120_000),
    longCallTimeoutMs: Math.max(300_000, num(env.BULC_MCP_CALL_TIMEOUT_MS, 120_000)),
    watchMs: num(env.BULC_MCP_WATCH_MS, 15_000),
    watchConnectedMs: Math.max(num(env.BULC_MCP_WATCH_MS, 15_000) * 4, 1000),
    attachImages: flag(env.BULC_MCP_ATTACH_IMAGES, true),
  };
}

/**
 * Tools whose app-side work can take minutes: drawing analysis (DWG conversion, large PDFs), network import,
 * report export, reading large result files, opening big projects, meshing helpers.
 */
export const LONG_RUNNING_TOOLS = new Set([
  "spr_analyze_drawing",
  "spr_import_network",
  "spr_export_results",
  "spr_import_fhc_bundle",
  "arch_analyze_drawing",
  "arch_import_building",
  "arch_import_floorplan_report",
  "fire_results_summary",
  "fire_timeseries",
  "fire_compute_aset",
  "results_detect",
  "project_open",
  "project_save",
  "project_export_fds",
  "sim_preflight",
  "auto_multimesh",
  "auto_cutcell_mesh",
]);
