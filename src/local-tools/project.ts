import { BridgeError } from "../bridge.js";
import { text } from "../results.js";
import { argString, obj, readOnly, type LocalTool } from "./types.js";

export const projectSummary: LocalTool = {
  def: {
    name: "get_project_summary",
    title: "Project summary",
    description:
      "Short summary of the project currently open in the BULC app: CHID, title, end time, mesh, and object counts " +
      "(obstacles, fire sources, vents, devices, evacuation agents, sprinkler heads, HVAC terminals). Needs the app. " +
      "On BULC 0.89+ project_info gives more (file path, unsaved changes, stories, deck path). 현재 앱 프로젝트 요약입니다.",
    inputSchema: obj({}),
    annotations: { title: "Project summary", ...readOnly },
  },
  async run(_args, ctx) {
    try {
      return text(JSON.stringify(await ctx.bridge.fetchSummary(), null, 2));
    } catch (err) {
      if (err instanceof BridgeError) return text(err.message, true);
      throw err;
    }
  },
};

const FAIL = /^\s*점검 실패/;
const WARN_COUNT = /경고\s*(\d+)\s*건/;

export const runSimulation: LocalTool = {
  def: {
    name: "run_simulation",
    title: "Run simulation (guarded)",
    description:
      "Guarded run for any BULC version: writes the project open in BULC to Documents/bulc_<folder_name> and starts the simulation. " +
      "Before starting, this server runs the app's validate_project and refuses to start when it reports errors (점검 실패) — fix them " +
      "first. When the app lists sim_preflight / sim_start (BULC 0.89+), prefer sim_preflight → user confirmation → sim_start {confirm: true}: " +
      "they also check output intervals and grid resolution and write the deck next to the saved project. Summarise the conditions " +
      "(mesh, fire, T_END, outputs, solver) and get the user's go-ahead before calling (GEN-016). Use a new folder_name per scenario (GEN-019). " +
      "실행 전에 validate_project 를 자동으로 돌리고, 오류가 있으면 실행하지 않습니다.",
    inputSchema: obj({
      folder_name: { type: "string", description: "Run folder name (defaults to the project CHID). Use one per scenario." },
      solver_type: {
        type: "string",
        enum: ["gpu", "gpu_cutcell", "cpu_openmp"],
        description: "gpu (default) | gpu_cutcell (beta, if your app build has it) | cpu_openmp (FDS 6.10.1 on the CPU)",
      },
    }),
    annotations: { title: "Run simulation (guarded)", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async run(args, ctx) {
    const folder = argString(args, "folder_name");
    const solver = argString(args, "solver_type");
    let check: { message: string };
    try {
      check = await ctx.bridge.callTool("validate_project", {}, ctx.cfg.callTimeoutMs);
    } catch (err) {
      if (err instanceof BridgeError) return text(err.message, true);
      throw err;
    }
    const msg = check.message ?? "";
    if (/^Unknown tool/i.test(msg.trim())) {
      // an app build without validate_project — run, but say so
    } else if (FAIL.test(msg)) {
      return text(
        "실행하지 않았습니다 — validate_project 가 오류를 보고했습니다. 아래 [오류] 를 고친 뒤 다시 실행하세요(GEN-006, GEN-016).\n" +
          "Not started — validate_project reported errors. Fix every [오류] below, then run again.\n\n" +
          msg,
        true,
      );
    }
    try {
      const r = await ctx.bridge.startRun(folder, solver);
      const warn = msg.match(WARN_COUNT)?.[1];
      return text(
        [
          "시뮬레이션을 시작했습니다 / Simulation started.",
          `- deck: ${r?.fdsPath ?? "(no path)"}`,
          `- output folder: ${r?.dir ?? "(no folder)"}`,
          warn ? `- validate_project: ${warn} warning(s) — 실행 전 경고를 사용자에게 알렸는지 확인하세요.` : "- validate_project: passed",
          "진행 상황은 sim_status(0.89 이상) 또는 get_simulation_metrics 로 확인합니다(nan=0, Tmax ≤ 2500 K, |u| < 50 m/s, SIM-007). 끝나면 fire_results_summary 로 결과를 읽습니다(GEN-010).",
          "Watch progress with sim_status (BULC 0.89+) or get_simulation_metrics; when it finishes read fire_results_summary.",
        ].join("\n"),
      );
    } catch (err) {
      if (err instanceof BridgeError) return text(err.message, true);
      throw err;
    }
  },
};
