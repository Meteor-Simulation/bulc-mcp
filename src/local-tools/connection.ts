import type { EndpointSource } from "../bridge.js";
import { text } from "../results.js";
import { obj, readOnly, type LocalTool } from "./types.js";

/** Compare dotted versions (pre-release suffixes ignored). */
export const cmpVersion = (a: string, b: string): number => {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

const SOURCE: Record<EndpointSource, string> = {
  env_url: "BULC_BRIDGE_URL",
  discovery: "the app's discovery file (BULC/bridge.json)",
  env_port: "BULC_BRIDGE_HOST/PORT (or the default 127.0.0.1:8787)",
};

export const connectionStatus: LocalTool = {
  def: {
    name: "bulc_connection_status",
    title: "BULC connection status",
    description:
      "Check whether the BULC desktop app is running and reachable through its local bridge, whether the program answering is really BULC, " +
      "how many tools it exposes, whether its tool set matches the bundled snapshot, and whether this server is showing the live tool list or " +
      "the bundled snapshot. Call this first, and again whenever an app tool fails. BULC 앱 연결 상태를 확인합니다.",
    inputSchema: obj({}),
    annotations: { title: "BULC connection status", ...readOnly },
  },
  async run(_args, ctx) {
    const probe = await ctx.bridge.probe();
    const snap = ctx.catalog.snapshot;
    const lines: string[] = [];
    lines.push(`bulc-mcp ${ctx.version} · profile ${ctx.cfg.profile} · bridge ${probe.url}${probe.source ? ` (from ${SOURCE[probe.source]})` : ""}`);
    lines.push(`snapshot: ${snap.toolCount} tools from BULC ${snap.appVersion ?? "?"} (${snap.generatedAt ?? "unknown date"}) · toolsHash ${snap.toolsHash ?? "?"}`);
    if (probe.state === "connected") {
      const h = probe.health!;
      lines.unshift("BULC 앱 연결됨 / BULC app connected.");
      lines.push(`app tools (live): ${h.toolCount ?? "?"} · project window: ${h.hasProject ? "yes / 있음" : "no / 없음"}${h.auth && h.auth !== "off" ? ` · bridge auth: ${h.auth}` : ""}`);
      if (h.appVersion) lines.push(`app version: ${h.appVersion}${h.bridgeVersion !== undefined ? ` · bridge v${h.bridgeVersion}` : ""}`);
      if (h.toolsHash && snap.toolsHash) {
        if (h.toolsHash === snap.toolsHash) lines.push("tool set: identical to the bundled snapshot.");
        else {
          const newer = h.appVersion && snap.appVersion ? cmpVersion(h.appVersion, snap.appVersion) : 0;
          lines.push(
            `tool set: differs from the bundled snapshot (app ${h.toolsHash} vs snapshot ${snap.toolsHash}${h.appVersion ? `, app ${h.appVersion} vs snapshot ${snap.appVersion}` : ""}). ` +
              "While the app is connected the live list is used, so calls follow the app. " +
              (newer < 0
                ? "The app is OLDER than this server's snapshot — tools such as project_*, sim_*, evac_run or arch_* may be missing; follow the fallbacks in the rules (GEN-014, GEN-016, EVAC-004, DRW-004) or ask the user to update BULC."
                : "The app is newer (or a development build) — offline listings of this server may lack its newest tools until bulc-mcp is updated."),
          );
        }
      } else if (h.appVersion && snap.appVersion && cmpVersion(h.appVersion, snap.appVersion) < 0) {
        lines.push(
          `note: the app (${h.appVersion}) is older than the bundled snapshot (${snap.appVersion}) — newer tools (project_*, sim_*, evac_run, arch_*) may be missing; ` +
            "use what tools/list shows and the fallbacks in the rules, or ask the user to update BULC.",
        );
      }
      if (!h.hasProject) lines.push("앱 창이 아직 준비되지 않았습니다. 잠시 후 다시 확인하세요. / The app window is not ready yet; retry in a moment.");
      return text(lines.join("\n"));
    }
    if (probe.state === "not_bulc") {
      lines.unshift("BULC 가 아닌 프로그램이 브리지 포트에서 응답합니다 / A non-BULC program answers on the bridge port.");
      lines.push(probe.detail ?? "");
      lines.push("지금은 내장 스냅샷 목록을 보여 주며 앱 도구 호출은 동작하지 않습니다(GEN-018). / Showing the bundled snapshot; app tool calls will fail (GEN-018).");
      return text(lines.join("\n"));
    }
    if (probe.state === "remote_blocked") {
      lines.unshift("브리지 주소가 루프백이 아니어서 연결하지 않았습니다 / Bridge host is not loopback; not connecting.");
      lines.push(probe.detail ?? "");
      return text(lines.join("\n"));
    }
    lines.unshift("BULC 앱에 연결되지 않았습니다 / BULC app not connected.");
    lines.push("- 조치: BULC 데스크톱 앱을 실행하세요. 앱이 켜지면 이 서버가 앱의 발견 파일(BULC/bridge.json)로 주소와 토큰을 찾습니다.");
    lines.push("  발견 파일을 쓰지 않는 구버전 앱이 기본 포트(8787)가 아닌 곳에서 돌면 MCP 설정의 BULC_BRIDGE_URL(또는 BULC_BRIDGE_PORT)을 앱과 같게 맞추세요.");
    lines.push("- Action: start the BULC desktop app; this server then finds it through the app's discovery file. For an older app on a non-default port, set BULC_BRIDGE_URL (or BULC_BRIDGE_PORT).");
    lines.push(
      "- 그동안 동작하는 도구 / Works without the app: bulc_knowledge_search, bulc_get_rules, bulc_plan_check, bulc_drawing_intake, bulc_check_deck, bulc_mesh_advisor, bulc_find_tools.",
    );
    lines.push("- 앱을 켜면 이 서버가 감지해 도구 목록 변경을 알립니다(클라이언트가 지원하는 경우). / When the app starts, this server notifies tools/list_changed.");
    return text(lines.join("\n"));
  },
};
