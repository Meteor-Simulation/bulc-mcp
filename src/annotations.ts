// MCP tool annotations for app tools, derived from the tool name. Newer apps send their own annotations
// in /tools (and the bundled snapshot carries them) — the app's values win.
//
// MCP defaults: readOnlyHint=false, destructiveHint=true, idempotentHint=false, openWorldHint=true.
// So every hint is set explicitly here.

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

const READ_ONLY = [
  /^list_/,
  /^get_/,
  /^preview_/,
  /^validate_/,
  /_list_summary$/,
  /_get_results$/,
  /^result_get_state$/,
  /^shape_get_/,
  /^draw_list_stories$/,
  /^spr_design_review$/,
  /^spr_analyze_drawing$/,
  /^arch_analyze_drawing$/,
  /^shape_preview_voxels$/,
  /^project_info$/,
  /^sim_(preflight|status|log_tail)$/,
  /^evac_status$/,
  /^results_detect$/,
  /^fire_(results_summary|timeseries|compute_aset)$/,
];

const DESTRUCTIVE = [
  /^remove_/,
  /_remove_/,
  /^evac_clear_agents$/,
  /^result_clear_graph_probes$/,
  /^shape_delete_node$/,
  /^shape_new_document$/,
  /^merge_meshes$/,
  /^set_meshes$/,
  /^auto_multimesh$/,
  /^auto_cutcell_mesh$/,
  /^spr_import_network$/, // mode=replace replaces the whole network
  /^spr_import_fhc_bundle$/, // mode=apply replaces the network
  /^rewrite_fds_via_ai$/, // rewrites the whole deck (older apps only — newer apps keep it in-app)
  /^project_(open|new)$/, // replaces the open project (refuses on unsaved changes unless discard_unsaved)
  /^(sim|evac)_stop$/,
  /^fds_apply_text$/, // replaces whole deck sections
];

const IDEMPOTENT = [/^set_/, /^update_/, /_set_/, /_update_/, /_upsert_/, /^assign_surface$/];

/** Tools that write files at a path the caller gives (some only with an optional path argument). */
export const FILE_WRITERS = new Set([
  "spr_export_results",
  "shape_export_stl",
  "shape_export_obj",
  "shape_screenshot",
  "project_save",
  "project_export_fds",
  "capture_view", // savePath
  "evac_run", // outputFolder
  "set_run_options", // fds_output_path: where runs write the deck and results
]);

/** Tools that start a long computation in the app. */
export const RUN_STARTERS = new Set(["sim_start", "evac_run", "run_simulation"]);

/** Tools that send data outside this machine (through the app's configured AI provider). */
export const EXTERNAL_SENDERS = new Set(["rewrite_fds_via_ai"]);

const titleOf = (name: string): string =>
  name
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");

export function annotationsFor(name: string, fromApp?: Record<string, unknown>): ToolAnnotations {
  const readOnly = READ_ONLY.some((re) => re.test(name));
  const destructive = !readOnly && DESTRUCTIVE.some((re) => re.test(name));
  const ann: ToolAnnotations = {
    title: titleOf(name),
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: readOnly || IDEMPOTENT.some((re) => re.test(name)),
    openWorldHint: EXTERNAL_SENDERS.has(name),
  };
  if (fromApp && typeof fromApp === "object") Object.assign(ann, fromApp);
  return ann;
}

/** Short notes appended to descriptions of tools with side effects worth knowing before calling. */
export function sideEffectNote(name: string): string | null {
  if (EXTERNAL_SENDERS.has(name))
    return "[bulc-mcp] Sends the whole current deck to the AI provider configured in the BULC app. Ask the user first; prefer dedicated tools (GEN-017).";
  if (name === "sim_start") return "[bulc-mcp] Starts the solver (GPU for minutes to hours): sim_preflight, summary, the user's go-ahead first (GEN-016).";
  if (name === "evac_run") return "[bulc-mcp] Starts the evacuation engine after the user agreed; outputFolder also writes the result there (EVAC-004).";
  if (name === "project_open" || name === "project_new") return "[bulc-mcp] discard_unsaved=true throws away unsaved edits — ask the user first (GEN-014).";
  if (name === "project_save" || name === "project_export_fds") return "[bulc-mcp] Writes files on this PC; overwrite=true only after the user agreed (GEN-014).";
  if (name === "capture_view") return "[bulc-mcp] Returns the picture as an image; savePath also writes a PNG on this PC.";
  if (FILE_WRITERS.has(name)) return "[bulc-mcp] Writes files on this PC at the path you give.";
  if (name === "spr_import_network") return "[bulc-mcp] mode='replace' replaces the current pipe network; call with dryRun=true first (DRW-009).";
  if (name === "spr_add_node" || name === "hvac_add_node")
    return "[bulc-mcp] Give heads / terminals a unique label (H1, H2 …, EX1 …): it becomes the FDS id after *_apply_to_fds (GEN-021).";
  if (name === "set_mesh" || name === "set_mesh_cell_size" || name === "auto_fit_mesh") return "[bulc-mcp] Resets a multi-mesh deck to a single mesh (MESH-004).";
  return null;
}
