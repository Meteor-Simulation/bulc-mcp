// bulc_plan_check — review an intended sequence of tool calls against the rules before acting.
import { annotationsFor } from "../annotations.js";
import { closest, checkArgs } from "../schema-check.js";
import { text } from "../results.js";
import { argBool, argString, obj, readOnly, type Ctx, type LocalTool } from "./types.js";

type Sev = "error" | "warning" | "info";

interface Step {
  n: number; // 1-based
  tool: string;
  args: Record<string, unknown>;
  hasArgs: boolean;
  note?: string;
}

interface Finding {
  severity: Sev;
  rule: string;
  step?: number;
  message: string;
}

/** File tools of other servers (the private headless server) → the BULC app's own tools. */
const FILE_TOOL_ALIASES: Record<string, string> = {
  new_project: "project_new",
  open_project: "project_open",
  import_fds: "project_open",
  save_project: "project_save",
  save_project_as: "project_save",
  export_fds: "project_export_fds",
};
/** Tools models tend to invent → the rule that explains it and the real tool(s). */
const IMAGINED: Record<string, { rule: string; use: string }> = {
  evac_add_exit: { rule: "EVAC-002", use: "exits come from OPEN vents, door items and Door_ holes (add_door id='Door_…')" },
  evac_start: { rule: "EVAC-004", use: "evac_run {confirm: true} → evac_status → evac_get_results" },
  run_evacuation: { rule: "EVAC-004", use: "evac_run {confirm: true} → evac_status → evac_get_results" },
  aset_report: { rule: "ASET-004", use: "fire_compute_aset (after output_add_tenability_slices and a finished run)" },
  compute_aset: { rule: "ASET-004", use: "fire_compute_aset" },
  import_architecture_drawing: { rule: "DRW-004", use: "arch_analyze_drawing → arch_import_building {dryRun: true}" },
  import_floorplan: { rule: "DRW-004", use: "arch_analyze_drawing → arch_import_building, or arch_import_floorplan_report for pictures" },
  analyze_floorplan: { rule: "DRW-004", use: "arch_analyze_drawing" },
  simulation_stop: { rule: "GEN-005", use: "sim_stop {confirm: true}" },
  stop_simulation: { rule: "GEN-005", use: "sim_stop {confirm: true}" },
  start_simulation: { rule: "GEN-016", use: "sim_preflight → user confirmation → sim_start {confirm: true}" },
  get_results: { rule: "GEN-010", use: "fire_results_summary / fire_timeseries / evac_get_results" },
};
/** Steps that start a run. */
const RUN_TOOLS = new Set(["run_simulation", "request_simulation_run", "sim_start"]);
/** Steps that count as the pre-run check (sim_preflight includes validate_project). */
const CHECK_TOOLS = new Set(["validate_project", "sim_preflight"]);

/** App tools that compute, report, save or view without changing the model itself. */
function changesModel(tool: string, args: Record<string, unknown>): boolean {
  if (/_run_calc$|_get_results$|_list_summary$|^result_|^shape_screenshot$|^shape_preview_voxels$/.test(tool)) return false;
  if (/^(sim|evac)_(status|stop|log_tail|preflight)$|^fire_|^results_detect$|^capture_view$|^project_(info|save|export_fds)$|^get_conventions$/.test(tool)) return false;
  if (["spr_design_review", "spr_export_results", "spr_analyze_drawing", "arch_analyze_drawing", "evac_run", "sim_start"].includes(tool)) return false;
  if (tool === "spr_pump_sizing") return args.apply === true;
  if (tool === "spr_import_fhc_bundle") return args.mode === "apply";
  // dryRun defaults to true for these — only dryRun:false changes the model
  if (["arch_import_building", "arch_import_floorplan_report", "fds_apply_text"].includes(tool)) return args.dryRun === false;
  return true;
}
const FIRE_WORDS = /화재|화원|불|발화|연소|fire|burn|hrr|kw|mw|heat release/i;
const DRAWING_WORDS = /도면|평면도|아이소|iso\b|isometric|drawing|\.dwg|\.dxf|\.pdf|cad/i;
const TOOL_MANAGED_GROUPS = /^\s*&(MESH|OBST|VENT|SURF|REAC|DEVC|CTRL|SLCF|BNDF|DUMP|TIME|MISC|HOLE|MATL|PROP|PART|RAMP|HEAD)\b/i;

function parseStep(raw: unknown, i: number): Step | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const tool = typeof r.tool === "string" ? r.tool.trim() : typeof r.name === "string" ? r.name.trim() : "";
    if (!tool) return null;
    const a = r.args ?? r.arguments;
    const args = a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
    return { n: i + 1, tool, args, hasArgs: !!a, note: typeof r.note === "string" ? r.note : undefined };
  }
  if (typeof raw === "string") {
    const m = raw.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*(\{[\s\S]*\})?/);
    if (!m) return null;
    let args: Record<string, unknown> = {};
    let hasArgs = false;
    if (m[2]) {
      try {
        const parsed = JSON.parse(m[2]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed;
          hasArgs = true;
        }
      } catch {
        /* free-form arguments — skip the schema check */
      }
    }
    return { n: i + 1, tool: m[1], args, hasArgs, note: raw };
  }
  return null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const xb6 = (v: unknown): number[] | null => (Array.isArray(v) && v.length === 6 && v.every(isNum) ? (v as number[]) : null);

function playbookFor(tools: string[], goal: string): string {
  const has = (re: RegExp) => tools.some((t) => re.test(t));
  if (has(/^spr_/) && /iso|아이소|물분무|water.?spray|deluge|일제|선박|marine|zone/i.test(goal)) return "05-marine-water-spray-iso";
  if (has(/^spr_|^add_sprinkler$/) || /스프링클러|sprinkler/i.test(goal)) return "04-sprinkler-design-fds-activation";
  if (has(/^hvac_/) || /제연|급기|배기|hvac|smoke control|duct|덕트/i.test(goal)) return "03-hvac-smoke-control";
  if (has(/^arch_/)) return "01-architectural-drawing-fire-aset";
  if (has(/^evac_/) || /피난|rset|evac/i.test(goal)) return "02-evacuation-fed-rset";
  if (/오류|error|안 ?됨|fail|문제|trouble/i.test(goal)) return "06-troubleshooting";
  return "01-architectural-drawing-fire-aset";
}

export const planCheck: LocalTool = {
  def: {
    name: "bulc_plan_check",
    title: "Check a plan before acting",
    description:
      "Review the sequence of tool calls you intend to make BEFORE calling them. Checks tool names and argument names against the " +
      "live app (or the bundled snapshot), and the plan against the BULC rules: units and XB order, total HRR from HRRPUA × area, " +
      "fires the user did not ask for, opening the floor boundary, single-mesh tools after multi-mesh, dump intervals ≥ T_END, " +
      "re-running hydraulic/HVAC calculations before applying them to FDS, unique labels for sprinkler heads and HVAC terminals, " +
      "dry runs before drawing imports, validate_project / sim_preflight before sim_start, user confirmation, evacuation run order, " +
      "file tools of other servers, and more. Returns findings with rule ids and the playbook to follow. Works without the app. " +
      "Steps are objects {tool, args} or strings like 'add_fire {\"hrrpua\": 500, \"xb\": [..]}'. 실행 전에 계획을 규칙으로 점검합니다.",
    inputSchema: obj(
      {
        goal: { type: "string", description: "What the user asked for, in their words (used for context checks)" },
        steps: {
          type: "array",
          description: "Planned calls in order: {tool, args?, note?} or 'tool_name {json args}'",
          items: { anyOf: [{ type: "string" }, { type: "object", properties: { tool: { type: "string" }, args: { type: "object" }, note: { type: "string" } }, required: ["tool"] }] },
        },
        fire_requested_by_user: { type: "boolean", description: "true if the user explicitly asked for a fire source or gave its location/size" },
        run_confirmed_by_user: { type: "boolean", description: "true if the user has confirmed the run conditions" },
      },
      ["steps"],
    ),
    annotations: { title: "Check a plan before acting", ...readOnly },
  },
  async run(args, ctx: Ctx) {
    const rawSteps = Array.isArray(args.steps) ? (args.steps as unknown[]) : [];
    const steps = rawSteps.map(parseStep).filter((s): s is Step => !!s);
    if (!steps.length) return text("steps 가 비어 있습니다 / steps is empty. Pass [{\"tool\": \"...\", \"args\": {...}}, ...].", true);
    const goal = argString(args, "goal") ?? "";
    const fireOk = argBool(args, "fire_requested_by_user") === true || FIRE_WORDS.test(goal);
    const runOk = argBool(args, "run_confirmed_by_user") === true;

    const { tools: appTools, live, probe } = await ctx.catalog.appTools();
    const appByName = new Map(appTools.map((t) => [t.name, t]));
    const local = new Map(ctx.catalog.localDefs().map((t) => [t.name, t]));
    const allNames = [...appByName.keys(), ...local.keys()];
    const f: Finding[] = [];
    const add = (severity: Sev, rule: string, message: string, step?: number) => f.push({ severity, rule, step, message });
    const seen = new Set<string>();
    const once = (key: string, fn: () => void) => {
      if (!seen.has(key)) {
        seen.add(key);
        fn();
      }
    };

    let tEnd: number | undefined;
    let multiMeshAt = 0;
    let lastEditAt = 0;
    let lastValidateAt = 0;
    let lastSprEditAt = 0;
    let lastSprCalcAt = 0;
    let lastHvacEditAt = 0;
    let lastHvacCalcAt = 0;
    let importCount = 0;
    let dryRunSeen = false;
    let usedAddSprinkler = 0;
    let usedSprApply = 0;
    let hasMeshSet = false;
    let hasGeometry = false;
    let hasFire = 0;
    let hasSlcf = false;
    let usesIntake = false;
    let appCalls = 0;
    let archDryRunSeen = false;
    let evacRunAt = 0;
    let evacStatusAt = 0;
    let hasEvacAgents = false;
    const labels = new Map<string, number>(); // spr/hvac node label → first step

    for (const s of steps) {
      const at = s.n;
      const def = appByName.get(s.tool) ?? local.get(s.tool);
      const isLocal = local.has(s.tool);
      if (!def) {
        const alias = FILE_TOOL_ALIASES[s.tool];
        if (alias) {
          add(
            "error",
            "GEN-014",
            appByName.has(alias)
              ? `'${s.tool}' is another server's name. Through the BULC app use ${alias} (absolute path; ask before discard_unsaved / overwrite).`
              : `'${s.tool}' does not exist and this BULC version has no ${alias} either — ask the user to use the app's File menu.`,
            at,
          );
        } else if (IMAGINED[s.tool]) {
          const im = IMAGINED[s.tool];
          add("error", "GEN-005", `'${s.tool}' does not exist — use ${im.use} (${im.rule}).`, at);
        } else {
          const near = closest(s.tool, allNames, 3);
          add("error", "GEN-005", `Unknown tool '${s.tool}'${near.length ? ` — did you mean ${near.join(", ")}?` : ""}`, at);
        }
        continue;
      }
      if (!isLocal) appCalls++;
      if (s.hasArgs) {
        for (const issue of checkArgs(def.inputSchema, s.args)) add(issue.kind === "type" ? "warning" : "error", "GEN-005", `${s.tool}: ${issue.message}`, at);
      }
      const appDef = appByName.get(s.tool);
      const ann = annotationsFor(s.tool, appDef?.annotations);
      const edits = !isLocal && !ann.readOnlyHint && !RUN_TOOLS.has(s.tool) && changesModel(s.tool, s.args);
      if (edits) lastEditAt = at;
      const a = s.args;

      // generic XB checks
      for (const [k, v] of Object.entries(a)) {
        const xb = /(^|_)xb$/i.test(k) ? xb6(v) : null;
        if (!xb) continue;
        if (xb[0] > xb[1] || xb[2] > xb[3] || xb[4] > xb[5])
          add("error", "GEN-003", `${s.tool}.${k}=[${xb.join(", ")}]: XB is [x1,x2,y1,y2,z1,z2] with min ≤ max on each axis.`, at);
        if (xb.some((c) => Math.abs(c) > 1000)) add("warning", "GEN-001", `${s.tool}.${k} has coordinates above 1000 — drawing millimetres? BULC works in metres (fine for a long tunnel).`, at);
      }
      for (const k of ["start", "end", "xyz"]) {
        const v = a[k];
        if (Array.isArray(v) && v.some((c) => isNum(c) && Math.abs(c) > 1000)) add("warning", "GEN-001", `${s.tool}.${k} has values above 1000 — millimetres instead of metres?`, at);
      }

      switch (s.tool) {
        case "set_time":
          if (isNum(a.t_end)) tEnd = a.t_end;
          break;
        case "set_mesh":
        case "set_mesh_cell_size":
        case "auto_fit_mesh":
          hasMeshSet = true;
          if (multiMeshAt) add("warning", "MESH-004", `${s.tool} after the multi-mesh step ${multiMeshAt} resets the deck to a single mesh.`, at);
          break;
        case "set_meshes":
        case "auto_multimesh":
        case "auto_cutcell_mesh":
          hasMeshSet = true;
          multiMeshAt = at;
          break;
        case "add_wall":
        case "add_floor":
        case "add_obstacle":
        case "shape_export_obst":
        case "place_furniture":
          hasGeometry = true;
          break;
        case "arch_analyze_drawing": {
          usesIntake = true;
          const p = typeof a.filePath === "string" ? a.filePath : undefined;
          if (p && !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(p)) add("error", "GEN-012", `arch_analyze_drawing.filePath '${p}' is not an absolute path on this PC. Ask the user for the full local path.`, at);
          break;
        }
        case "arch_import_building":
        case "arch_import_floorplan_report": {
          if (a.dryRun === false) {
            hasGeometry = true;
            if (!archDryRunSeen) add("info", "DRW-003", `${s.tool}: run it once without dryRun:false first and confirm counts, size and story with the user.`, at);
          } else archDryRunSeen = true;
          const b = (a.building ?? {}) as Record<string, unknown>;
          for (const key of ["doors", "windows"]) {
            const ops = Array.isArray(b[key]) ? (b[key] as Record<string, unknown>[]) : [];
            if (ops.some((o) => o && typeof o === "object" && o.wall === 0))
              add("error", "DRW-004", `${s.tool}: building.${key}[].wall counts from 1 (wall 1 = building.walls[0]); wall: 0 is dropped.`, at);
          }
          break;
        }
        case "spr_add_node":
        case "hvac_add_node": {
          const type = typeof a.type === "string" ? a.type : "";
          const terminal = s.tool === "spr_add_node" ? type === "" || type === "sprinkler" : type === "" || type === "supply_diffuser" || type === "exhaust_grille";
          const label = typeof a.label === "string" ? a.label.trim() : "";
          if (terminal && s.hasArgs && !label)
            once(`label-${s.tool}`, () =>
              add("warning", "GEN-021", `${s.tool}: give every ${s.tool === "spr_add_node" ? "sprinkler head" : "HVAC terminal"} a unique label (H1, H2 … / EX1 …) — it becomes the FDS id; unlabelled nodes created within ~1 s got the same id on BULC 0.88.`, at),
            );
          if (label) {
            const key = `${s.tool}:${label.toUpperCase()}`;
            if (labels.has(key)) add("error", "GEN-021", `${s.tool}: label '${label}' is already used at step ${labels.get(key)} — labels become FDS ids and must be unique.`, at);
            else labels.set(key, at);
          }
          break;
        }
        case "evac_add_agent":
        case "evac_add_agents_batch":
          hasEvacAgents = true;
          break;
        case "evac_run":
          evacRunAt = at;
          if (a.confirm !== true) add("error", "EVAC-004", "evac_run needs confirm=true, and only after the user agreed to start the evacuation run.", at);
          if (!hasEvacAgents) once("evac-agents", () => add("info", "EVAC-004", "evac_run: the plan places no agents — check evac_list_summary; the run refuses without agents.", at));
          if (a.allowNoExits === true) add("warning", "EVAC-002", "evac_run allowNoExits=true uses temporary exits at the domain edge — not the real building; tell the user.", at);
          break;
        case "evac_status":
          evacStatusAt = at;
          break;
        case "evac_get_results":
          if (evacRunAt && evacStatusAt < evacRunAt) add("info", "EVAC-004", "evac_get_results right after evac_run: poll evac_status until it reports finished, otherwise the previous result is read.", at);
          break;
        case "sim_start":
          if (a.confirm !== true) add("error", "GEN-016", "sim_start needs confirm=true, and only after the user agreed to the summarised run conditions.", at);
          if (a.force === true) add("warning", "GEN-016", "sim_start force=true runs despite sim_preflight errors — only if the user explicitly accepts them.", at);
          break;
        case "output_add_tenability_slices":
          hasSlcf = true;
          break;
        case "project_open":
        case "project_new":
          if (a.discard_unsaved === true) add("warning", "GEN-014", `${s.tool}: discard_unsaved=true throws away unsaved edits — ask the user first (or project_save before).`, at);
          break;
        case "project_save":
        case "project_export_fds":
          if (a.overwrite === true) add("info", "GEN-014", `${s.tool}: overwrite=true replaces an existing file — only after the user agreed.`, at);
          break;
        case "add_fire": {
          hasFire++;
          const xb = xb6(a.xb);
          const hrrpua = isNum(a.hrrpua) ? a.hrrpua : undefined;
          if (xb && hrrpua !== undefined) {
            const dx = xb[1] - xb[0];
            const dy = xb[3] - xb[2];
            const area = Math.abs(dx * dy);
            if (area > 0) add("info", "FIRE-001", `add_fire: HRRPUA ${hrrpua} kW/m² × ${area.toFixed(2)} m² ≈ ${(hrrpua * area).toFixed(0)} kW total (before grid snapping). Compare with the user's design HRR.`, at);
          }
          if (hrrpua !== undefined && hrrpua >= 2500) add("warning", "FIRE-001", `add_fire: hrrpua=${hrrpua} kW/m² is very high — did you pass the total HRR (kW) instead of HRR per area?`, at);
          if (a.tmp_front === undefined) add("info", "FIRE-006", "add_fire: tmp_front not given — the burner surface is written as 300 °C by default; decide it deliberately (e.g. 20).", at);
          if (a.growth !== undefined && a.time_to_peak === undefined) add("warning", "FIRE-004", "add_fire: growth without time_to_peak — compute the t² time to reach this fire's peak (√(Q/α)).", at);
          if (!fireOk) once("fire-auth", () => add("warning", "GEN-015", "The plan adds a fire source but the goal does not mention one. Ask the user for location, peak HRR, growth and fuel first.", at));
          break;
        }
        case "set_fds_properties": {
          const o = (a.fds_override ?? {}) as Record<string, unknown>;
          if (a.is_fire_source === true) {
            hasFire++;
            if (!fireOk) once("fire-auth", () => add("warning", "GEN-015", "The plan makes an obstacle a fire source but the goal does not mention a fire. Confirm with the user.", at));
          }
          if (Array.isArray(o.fire_faces) && o.fire_faces.some((x) => typeof x === "string"))
            add("error", "FIRE-013", "set_fds_properties: fire_faces takes six booleans [-X,+X,-Y,+Y,-Z,+Z], not face names.", at);
          if (o.ramp_points !== undefined && o.ramp_id === undefined) add("warning", "FIRE-014", "set_fds_properties: give ramp_id together with ramp_points, otherwise the ramp is dropped from the deck.", at);
          break;
        }
        case "set_all_boundaries_open": {
          const faces = Array.isArray(a.faces) ? (a.faces as unknown[]).map((x) => String(x).toUpperCase()) : null;
          if (!faces) add("error", "VENT-002", "set_all_boundaries_open without faces opens ZMIN (the floor) too. Pass faces, e.g. [\"XMIN\",\"XMAX\",\"YMIN\",\"YMAX\",\"ZMAX\"].", at);
          else if (faces.includes("ZMIN")) add("warning", "VENT-002", "faces includes ZMIN — the domain floor becomes open; a floor burner loses its base.", at);
          break;
        }
        case "update_dump_config":
          for (const [k, v] of Object.entries(a)) {
            if (/^dt_/.test(k) && isNum(v) && tEnd !== undefined && v >= tEnd) add("warning", "OUT-001", `update_dump_config.${k}=${v} ≥ T_END ${tEnd} s — only the t=0 frame would be written.`, at);
          }
          break;
        case "set_numerics":
          if (a.lock_time_step === true && !isNum(a.dt)) add("error", "SIM-002", "set_numerics: lock_time_step=true needs dt.", at);
          break;
        case "add_raw_namelist":
          if (typeof a.line === "string" && TOOL_MANAGED_GROUPS.test(a.line))
            add("warning", "SIM-006", "add_raw_namelist: this group is managed by a dedicated tool — use that tool to avoid duplicate namelists.", at);
          break;
        case "rewrite_fds_via_ai":
          add("warning", "GEN-017", "rewrite_fds_via_ai sends the whole deck to the app's AI provider and is not deterministic. Use dedicated tools, or preview_fds → edit → fds_apply_text.", at);
          break;
        case "fds_apply_text":
          if (a.dryRun === false && !steps.some((x) => x.tool === "fds_apply_text" && x.n < at && x.args.dryRun !== false))
            add("info", "GEN-017", "fds_apply_text: call it once with the default dryRun first and check which sections change.", at);
          break;
        case "add_slcf":
          hasSlcf = true;
          break;
        case "add_door":
        case "add_hole":
        case "add_window": {
          const id = typeof a.id === "string" ? a.id : "";
          if (/^Window_/.test(id)) add("warning", "EVAC-003", `${s.tool} id '${id}': holes named Window_… become evacuation exits. Use another prefix (e.g. Win_) for windows.`, at);
          if (s.tool === "add_door" && id && !/^Door_/.test(id)) add("info", "EVAC-003", `add_door id '${id}' has no Door_ prefix — evacuation will not treat it as an exit (and may treat it as a wall).`, at);
          break;
        }
        case "add_sprinkler":
          usedAddSprinkler = at;
          if (isNum(a.operating_pressure) && a.operating_pressure < 0.3) add("warning", "SPR-011", `add_sprinkler.operating_pressure=${a.operating_pressure} looks like MPa; FDS heads take bar.`, at);
          if (isNum(a.k_factor) && a.k_factor < 20) add("warning", "SPR-010", `add_sprinkler.k_factor=${a.k_factor} looks like a US K (gpm/psi^½); metric K = US K × 14.41.`, at);
          break;
        case "spr_analyze_drawing": {
          usesIntake = true;
          const p = typeof a.filePath === "string" ? a.filePath : undefined;
          if (p && !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(p)) add("error", "GEN-012", `spr_analyze_drawing.filePath '${p}' is not an absolute path on this PC. Ask the user for the full local path.`, at);
          break;
        }
        case "bulc_drawing_intake":
          usesIntake = true;
          break;
        case "spr_import_network":
          importCount++;
          if (a.dryRun === true) dryRunSeen = true;
          else {
            if (!dryRunSeen && a.candidateId !== undefined) add("info", "DRW-006", "spr_import_network: call it once with dryRun=true and confirm counts and warnings with the user before importing.", at);
            if (importCount > 1 && a.mode !== "replace") add("warning", "DRW-009", "A second spr_import_network without mode='replace' appends — the network would be duplicated.", at);
          }
          lastSprEditAt = at;
          break;
        case "spr_run_calc":
          lastSprCalcAt = at;
          break;
        case "spr_apply_to_fds":
          usedSprApply = at;
          if (lastSprEditAt && lastSprCalcAt < lastSprEditAt) add("error", "SPR-004", "spr_apply_to_fds without a spr_run_calc after the last pipe-network edit applies stale or missing flows.", at);
          else if (!lastSprCalcAt) add("warning", "SPR-004", "spr_apply_to_fds: make sure spr_run_calc ran after the last pipe-network change (the plan does not run it).", at);
          break;
        case "hvac_run_calc":
          lastHvacCalcAt = at;
          break;
        case "hvac_apply_to_fds":
          if (!lastHvacCalcAt || lastHvacCalcAt < lastHvacEditAt) add("warning", "HVAC-003", "hvac_apply_to_fds without hvac_run_calc after the last HVAC edit uses design CFM, not calculated flows.", at);
          break;
        case "validate_project":
        case "sim_preflight":
          lastValidateAt = at;
          break;
        default:
          break;
      }
      if (/^spr_/.test(s.tool) && edits && s.tool !== "spr_import_network" && s.tool !== "spr_apply_to_fds") lastSprEditAt = at;
      if (/^hvac_/.test(s.tool) && edits && s.tool !== "hvac_apply_to_fds") lastHvacEditAt = at;
      if (/^spr_/.test(s.tool)) {
        for (const k of ["requiredPressure", "requiredPressureOpen", "requiredPressureClosed"]) {
          const v = a[k];
          if (isNum(v) && v > 2) add("warning", "SPR-011", `${s.tool}.${k}=${v} — pipe-network pressures are MPa (0.1 MPa = 1 bar).`, at);
        }
        for (const k of ["kFactor", "defaultKFactor"]) {
          const v = a[k];
          if (isNum(v) && v < 20) add("warning", "SPR-010", `${s.tool}.${k}=${v} looks like a US K; metric K = US K × 14.41.`, at);
        }
      }
      if (/^evac_/.test(s.tool) && ("floorIndex" in a || "fromFloorIndex" in a))
        once("evac-floor", () => add("info", "EVAC-001", "EVAC floorIndex counts from 0 (1F = 0, 2F = 1), unlike story ids (1F = 1).", at));
      if (/^hvac_add_(supply_diffuser|exhaust_grille)$/.test(s.tool))
        once("hvac-cfm", () => add("info", "HVAC-001", "HVAC terminal airflow is in CFM (1 m³/h = 0.5886 CFM); size the terminal so face velocity stays realistic (HVAC-004).", at));
      if (RUN_TOOLS.has(s.tool)) {
        if (lastEditAt > lastValidateAt)
          add(
            "error",
            "GEN-006",
            `${s.tool} at step ${at}: no ${[...CHECK_TOOLS].filter((t) => appByName.has(t)).join(" / ") || "validate_project"} after the last edit (step ${lastEditAt}). Insert it and fix every error first.`,
            at,
          );
        if ((s.tool === "run_simulation" || s.tool === "sim_start") && !runOk)
          add(
            "warning",
            "GEN-016",
            `Summarise the run conditions (mesh/cells, fire, T_END, outputs, solver) and get the user's go-ahead before ${s.tool}` +
              (s.tool === "run_simulation" && appByName.has("sim_start") ? " — with this app prefer sim_preflight → confirmation → sim_start {confirm: true}." : "."),
            at,
          );
        if (tEnd === undefined) once("tend", () => add("info", "FIRE-005", "The plan never sets T_END — check get_simulation_settings; T_END must cover growth plus the assessment window.", at));
      }
      if (s.tool === "fire_compute_aset" && steps.some((x) => RUN_TOOLS.has(x.tool) && x.n < at) && !hasSlcf)
        once("aset-slices", () => add("info", "ASET-004", "fire_compute_aset reads 1.8 m slices — add output_add_tenability_slices before the run, or it reports missing quantities.", at));
    }

    if (usedAddSprinkler && usedSprApply) add("warning", "SPR-020", "Both add_sprinkler and spr_apply_to_fds create FDS heads — the heads would be duplicated. Use one path.", usedAddSprinkler);
    if (lastEditAt && !lastValidateAt && !f.some((x) => x.rule === "GEN-006")) add("warning", "GEN-006", "The plan edits the model but never calls validate_project.");
    if (hasGeometry && !hasMeshSet) add("warning", "MESH-001", "Geometry is added but this plan never sets the mesh — check list_meshes; a new project's default mesh is a 1 m cube.");
    if (hasFire && !hasSlcf) add("info", "OUT-008", "A fire is planned but no add_slcf — check list_slcf; without slices there is nothing to view.");
    if (DRAWING_WORDS.test(goal) && !usesIntake) add("info", "DRW-001", "The goal mentions a drawing — start with bulc_drawing_intake (then arch_analyze_drawing / spr_analyze_drawing) to fix units, scale and the playbook.");
    if (lastSprEditAt && !steps.some((s) => s.tool === "spr_design_review")) add("info", "SPR-040", "Sprinkler edits are planned — run spr_design_review and clear its errors before reporting.");
    if (appCalls && !live) {
      add(
        "warning",
        "GEN-018",
        probe.state === "not_bulc"
          ? "The bridge port answers but it is not BULC — app tools will fail. See bulc_connection_status."
          : "The BULC app is not connected — app tools will fail until the user starts it. Plan only; do not report edits as done.",
      );
    }

    const order: Record<Sev, number> = { error: 0, warning: 1, info: 2 };
    f.sort((x, y) => order[x.severity] - order[y.severity] || (x.step ?? 0) - (y.step ?? 0));
    const errors = f.filter((x) => x.severity === "error").length;
    const warnings = f.filter((x) => x.severity === "warning").length;
    const verdict = errors ? "fix_before_acting" : warnings ? "review_warnings" : "ok";
    const pb = playbookFor(steps.map((s) => s.tool), goal);
    const lines = [
      `verdict: ${verdict} — ${errors} error(s), ${warnings} warning(s), ${f.length - errors - warnings} note(s) for ${steps.length} step(s) · tools from ${live ? "the live app" : "the bundled snapshot"}`,
      errors ? "판정: 계획을 고친 뒤 실행하세요. / Fix the plan before calling any tool." : warnings ? "판정: 경고를 검토하고 필요하면 사용자에게 확인하세요. / Review the warnings." : "판정: 규칙 위반을 찾지 못했습니다. / No rule violations found.",
      "",
      ...f.map((x) => `- [${x.severity}] ${x.rule}${x.step ? ` (step ${x.step})` : ""}: ${x.message}`),
      "",
      `playbook: bulc://knowledge/playbooks/${pb}`,
      "규칙 원문 / rule text: bulc_knowledge_search \"<rule id>\"",
    ];
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { verdict, errors, warnings, findings: f, playbook: pb, live } };
  },
};
