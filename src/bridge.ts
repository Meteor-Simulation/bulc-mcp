// HTTP client for the bridge that the BULC desktop app hosts on 127.0.0.1.
//
//   GET  /health                                → { ok, app, appVersion, bridgeVersion, toolCount, toolsHash, hasProject, auth }
//   GET  /tools                                 → { tools: [{ name, description, inputSchema, category, annotations, liveOnly? }] }
//   POST /call    { name, args }                → { message, action?, data?, image?: { base64, mimeType } }
//   POST /summary {}                            → { summary }
//   POST /run     { folder_name, solver_type }  → { ok, fdsPath, dir }   (older apps; newer ones also have sim_start)
//
// Where the bridge is: BULC_BRIDGE_URL if set; otherwise the discovery file the app writes when its bridge starts
// (BULC/bridge.json in the user's config folder: url, port, pid, token); otherwise BULC_BRIDGE_HOST/PORT (default
// 127.0.0.1:8787). A discovery file whose process is gone is ignored. When the app runs with BULC_BRIDGE_AUTH=sensitive|all
// the token from that file (or BULC_BRIDGE_TOKEN) is sent as Authorization: Bearer — only to the address it belongs to.
//
// The bridge only listens on the loopback interface and rejects browser-style requests (Origin header, non-JSON bodies,
// foreign Host headers). This client never sends an Origin header and refuses non-loopback hosts unless
// BULC_MCP_ALLOW_REMOTE=1.
import fs from "node:fs";
import type { Config } from "./config.js";

export type BridgeErrorKind =
  | "not_running" // nothing answers, or the app has no window yet
  | "not_bulc" // something answers, but it is not the BULC bridge
  | "remote_blocked" // configured host is not loopback
  | "forbidden" // the bridge's own security check refused the request
  | "unauthorized" // the bridge wants a token (BULC_BRIDGE_AUTH) and none / a wrong one was sent
  | "app_error" // the app answered with an error (4xx/5xx with a message)
  | "bad_response"; // unparseable answer

export class BridgeError extends Error {
  readonly kind: BridgeErrorKind;
  readonly status?: number;
  constructor(kind: BridgeErrorKind, message: string, status?: number) {
    super(message);
    this.name = "BridgeError";
    this.kind = kind;
    this.status = status;
  }
}

export interface BridgeTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: string;
  annotations?: Record<string, unknown>;
  /** Works only against the running app (open/save/run/capture …), never in a headless session. */
  liveOnly?: boolean;
}

export interface Health {
  ok: boolean;
  hasProject?: boolean;
  toolCount?: number;
  app?: string;
  appVersion?: string;
  bridgeVersion?: number;
  /** First 16 hex digits of sha256(JSON of the app's public tool list) — compare with the bundled snapshot. */
  toolsHash?: string;
  /** off | sensitive | all (BULC_BRIDGE_AUTH of the app) */
  auth?: string;
}

/** One tool call answered by the app. */
export interface AppReply {
  message: string;
  action?: { type?: string; summary?: string } | null;
  /** Structured result (newer apps) — becomes MCP structuredContent. */
  data?: unknown;
  /** Picture (capture_view, shape_screenshot on newer apps). */
  image?: { base64: string; mimeType?: string } | null;
}

export type EndpointSource = "env_url" | "discovery" | "env_port";

export interface Endpoint {
  url: string;
  host: string;
  token: string | null;
  source: EndpointSource;
}

export type ProbeState = "connected" | "not_running" | "not_bulc" | "remote_blocked";

export interface Probe {
  state: ProbeState;
  url: string;
  source?: EndpointSource;
  health?: Health;
  detail?: string;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return LOOPBACK.has(h) || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/** Does this /health body look like the BULC bridge? */
export function looksLikeBulcHealth(body: unknown): body is Health {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  if (b.ok !== true) return false;
  if (typeof b.toolCount !== "number") return false;
  if (b.app !== undefined && String(b.app).toLowerCase() !== "bulc") return false;
  return true;
}

export interface Discovery {
  url: string;
  host: string;
  port: number;
  token: string | null;
  pid: number | null;
  appVersion?: string;
  auth?: string;
}

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else — treat as alive
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

/**
 * Read the app's discovery file. Returns null when it is missing, malformed, not BULC's, not a loopback address,
 * or written by a process that no longer runs (a crashed app leaves the file behind).
 */
export function readDiscovery(file: string | null, checkPid = true): Discovery | null {
  if (!file) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (d.app !== undefined && String(d.app).toLowerCase() !== "bulc") return null;
  let url = typeof d.url === "string" ? d.url.trim().replace(/\/+$/, "") : "";
  if (!url && typeof d.port === "number" && d.port > 0) url = `http://127.0.0.1:${d.port}`;
  let host = "";
  let port = 0;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return null;
    host = u.hostname;
    port = Number(u.port) || 80;
  } catch {
    return null;
  }
  if (!isLoopbackHost(host)) return null;
  const pid = typeof d.pid === "number" && Number.isInteger(d.pid) && d.pid > 0 ? d.pid : null;
  if (checkPid && pid !== null && !processAlive(pid)) return null;
  const token = typeof d.token === "string" && /^[A-Za-z0-9._~-]{16,256}$/.test(d.token) ? d.token : null;
  return {
    url,
    host,
    port,
    token,
    pid,
    appVersion: typeof d.appVersion === "string" ? d.appVersion : undefined,
    auth: typeof d.auth === "string" ? d.auth : undefined,
  };
}

export function notRunningMessage(url: string, detail?: string, source?: EndpointSource): string {
  const how =
    source === "env_url"
      ? [
          "MCP 설정의 BULC_BRIDGE_URL 로 주소를 지정했으므로 앱의 발견 파일은 쓰지 않습니다. 주소가 앱의 브리지와 같은지 확인하거나, BULC_BRIDGE_URL 을 지우면 앱이 켜져 있을 때 발견 파일(BULC/bridge.json)로 주소를 찾습니다.",
          "BULC_BRIDGE_URL is set, so the app's discovery file is not used: check that it matches the app's bridge, or remove it to let this server find the running app through BULC/bridge.json.",
        ]
      : [
          "앱이 켜져 있으면 이 서버가 앱의 발견 파일(BULC/bridge.json)로 주소를 찾습니다. 찾지 못하면 MCP 설정의 BULC_BRIDGE_URL(또는 BULC_BRIDGE_PORT)을 앱의 브리지 주소와 같게 맞춰 주세요.",
          "While the app runs this server finds it through the app's discovery file (BULC/bridge.json); otherwise set BULC_BRIDGE_URL (or BULC_BRIDGE_PORT) to the app's bridge address.",
        ];
  return (
    `BULC 앱에 연결할 수 없습니다 (${url}). BULC 데스크톱 앱을 실행한 뒤 다시 시도하세요. ${how[0]}\n` +
    `Cannot reach the BULC desktop app at ${url}. Start BULC and try again. ${how[1]}` +
    (detail ? `\n[detail] ${detail}` : "")
  );
}

export function notBulcMessage(url: string, detail?: string): string {
  return (
    `${url} 에서 BULC 가 아닌 프로그램이 응답합니다. 다른 프로그램이 같은 포트를 쓰고 있을 수 있습니다. ` +
    `BULC 앱을 켜 두면 발견 파일로 앱의 실제 포트를 찾습니다. 그래도 안 되면 앱을 빈 포트로 실행하고(앱의 BULC_BRIDGE_PORT) MCP 설정의 BULC_BRIDGE_URL 을 그 주소로 맞춰 주세요.\n` +
    `A program that is not the BULC bridge answers at ${url} — another application probably uses this port. With BULC running, ` +
    `this server finds the app's real port through its discovery file; otherwise start BULC on a free bridge port and point BULC_BRIDGE_URL at it.` +
    (detail ? `\n[detail] ${detail}` : "")
  );
}

export function remoteBlockedMessage(url: string): string {
  return (
    `브리지 주소 ${url} 는 이 PC(루프백) 주소가 아니어서 연결하지 않았습니다. BULC 브리지는 127.0.0.1 에서만 동작합니다. ` +
    `원격 주소가 꼭 필요하면 BULC_MCP_ALLOW_REMOTE=1 을 설정하세요.\n` +
    `Refusing to connect to ${url}: the BULC bridge is loopback-only. Set BULC_MCP_ALLOW_REMOTE=1 only if you really mean it.`
  );
}

export function unauthorizedMessage(url: string, detail?: string): string {
  return (
    `BULC 브리지가 토큰을 요구합니다(앱이 BULC_BRIDGE_AUTH=sensitive|all 로 실행됨, ${url}). 앱이 쓰는 발견 파일(BULC/bridge.json)을 이 서버가 읽을 수 있는지 확인하거나, ` +
    `그 파일의 token 값을 MCP 설정의 BULC_BRIDGE_TOKEN 에 넣어 주세요.\n` +
    `The BULC bridge requires a token (the app runs with BULC_BRIDGE_AUTH). Make sure this server can read the app's discovery file ` +
    `(BULC/bridge.json), or put its token in BULC_BRIDGE_TOKEN.` +
    (detail ? `\n[detail] ${detail}` : "")
  );
}

export class BridgeClient {
  /** The endpoint that answered as BULC at the last probe (null until then, or after it stopped answering). */
  private active: Endpoint | null = null;

  constructor(private readonly cfg: Config) {}

  /** Candidate endpoints in order: BULC_BRIDGE_URL | discovery file → BULC_BRIDGE_HOST/PORT. */
  candidates(): Endpoint[] {
    if (this.cfg.explicitUrl) return [{ url: this.cfg.bridgeUrl, host: this.cfg.bridgeHost, token: this.cfg.token, source: "env_url" }];
    const out: Endpoint[] = [];
    const d = readDiscovery(this.cfg.discoveryFile);
    if (d) out.push({ url: d.url, host: d.host, token: d.token ?? this.cfg.token, source: "discovery" });
    if (!out.some((e) => e.url === this.cfg.bridgeUrl)) out.push({ url: this.cfg.bridgeUrl, host: this.cfg.bridgeHost, token: this.cfg.token, source: "env_port" });
    return out;
  }

  private endpoint(): Endpoint {
    return this.active ?? this.candidates()[0];
  }

  get url(): string {
    return this.endpoint().url;
  }

  private guard(ep: Endpoint): void {
    if (!this.cfg.allowRemote && !isLoopbackHost(ep.host)) {
      throw new BridgeError("remote_blocked", remoteBlockedMessage(ep.url));
    }
  }

  private headers(ep: Endpoint, extra: Record<string, string>): Record<string, string> {
    return ep.token ? { ...extra, authorization: `Bearer ${ep.token}` } : extra;
  }

  private async request(ep: Endpoint, path: string, init: RequestInit & { headers: Record<string, string> }, timeoutMs: number): Promise<unknown> {
    this.guard(ep);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${ep.url}${path}`, { ...init, headers: this.headers(ep, init.headers), signal: controller.signal });
    } catch (err) {
      const why = err instanceof Error ? (err.name === "AbortError" ? `no answer within ${timeoutMs} ms` : err.message) : String(err);
      throw new BridgeError("not_running", notRunningMessage(ep.url, why, ep.source));
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => "");
    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = undefined;
    }
    if (!res.ok) {
      const msg = body && typeof body === "object" && "error" in (body as object) ? String((body as { error: unknown }).error) : text.slice(0, 300);
      if (res.status === 503) throw new BridgeError("not_running", notRunningMessage(ep.url, msg || "app window not ready", ep.source), 503);
      if (res.status === 401) throw new BridgeError("unauthorized", unauthorizedMessage(ep.url, msg), 401);
      if (res.status === 403)
        throw new BridgeError(
          "forbidden",
          `BULC 브리지가 보안 검사로 요청을 거절했습니다(${msg}). 브리지 주소는 127.0.0.1 또는 localhost 로 지정하세요.\n` +
            `The BULC bridge refused the request (${msg}). Use 127.0.0.1 or localhost in BULC_BRIDGE_URL.`,
          403,
        );
      if (res.status === 404 && body === undefined) throw new BridgeError("not_bulc", notBulcMessage(ep.url, `HTTP 404 on ${path}`), 404);
      throw new BridgeError("app_error", `BULC 앱 오류 / BULC app error (HTTP ${res.status}): ${msg || res.statusText}`, res.status);
    }
    if (body === undefined) {
      throw new BridgeError("not_bulc", notBulcMessage(ep.url, `non-JSON answer on ${path}`));
    }
    return body;
  }

  private get(path: string, timeoutMs: number): Promise<unknown> {
    return this.request(this.endpoint(), path, { method: "GET", headers: { accept: "application/json" } }, timeoutMs);
  }

  private post(path: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    return this.request(
      this.endpoint(),
      path,
      { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload ?? {}) },
      timeoutMs,
    );
  }

  private async probeOne(ep: Endpoint): Promise<Probe> {
    const base = { url: ep.url, source: ep.source };
    try {
      const body = await this.request(ep, "/health", { method: "GET", headers: { accept: "application/json" } }, this.cfg.healthTimeoutMs);
      if (!looksLikeBulcHealth(body)) return { ...base, state: "not_bulc", detail: "unexpected /health answer" };
      return { ...base, state: "connected", health: body };
    } catch (err) {
      if (err instanceof BridgeError) {
        if (err.kind === "remote_blocked") return { ...base, state: "remote_blocked", detail: err.message };
        if (err.kind === "not_bulc" || (err.kind === "app_error" && err.status !== undefined && err.status < 500))
          return { ...base, state: "not_bulc", detail: err.message };
        return { ...base, state: "not_running", detail: err.message };
      }
      return { ...base, state: "not_running", detail: String(err) };
    }
  }

  /** Probe the candidate endpoints and identify the bridge. Never throws. */
  async probe(): Promise<Probe> {
    let first: Probe | null = null;
    for (const ep of this.candidates()) {
      const p = await this.probeOne(ep);
      if (p.state === "connected") {
        this.active = ep;
        return p;
      }
      first ??= p;
    }
    this.active = null;
    return first!;
  }

  async fetchTools(): Promise<BridgeTool[]> {
    const data = (await this.get("/tools", this.cfg.toolsTimeoutMs)) as { tools?: unknown };
    if (!Array.isArray(data?.tools)) throw new BridgeError("not_bulc", notBulcMessage(this.url, "/tools has no tools array"));
    return (data.tools as unknown[]).filter(
      (t): t is BridgeTool => !!t && typeof (t as BridgeTool).name === "string" && typeof (t as BridgeTool).description === "string",
    );
  }

  async callTool(name: string, args: unknown, timeoutMs: number): Promise<AppReply> {
    const data = (await this.post("/call", { name, args: args ?? {} }, timeoutMs)) as Record<string, unknown> | null;
    const img = data?.image as { base64?: unknown; mimeType?: unknown } | undefined;
    return {
      message: typeof data?.message === "string" ? data.message : JSON.stringify(data ?? {}),
      action: (data?.action as AppReply["action"] | undefined) ?? null,
      ...(data && "data" in data && data.data !== undefined ? { data: data.data } : {}),
      ...(img && typeof img.base64 === "string" && img.base64
        ? { image: { base64: img.base64, mimeType: typeof img.mimeType === "string" ? img.mimeType : "image/png" } }
        : {}),
    };
  }

  async fetchSummary(): Promise<unknown> {
    const data = (await this.post("/summary", {}, this.cfg.toolsTimeoutMs * 2)) as { summary?: unknown };
    return data?.summary ?? data;
  }

  async startRun(folderName?: string, solverType?: string): Promise<{ ok?: boolean; fdsPath?: string; dir?: string }> {
    return (await this.post("/run", { folder_name: folderName, solver_type: solverType }, this.cfg.callTimeoutMs)) as {
      ok?: boolean;
      fdsPath?: string;
      dir?: string;
    };
  }
}
