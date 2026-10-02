// Initialization instructions — the core rules every client model should see once.

export function buildInstructions(ruleCount: number): string {
  return [
    "BULC MCP: drives the BULC desktop app (fire/smoke CFD on FDS 6.10.1, evacuation, HVAC smoke control, sprinkler and water-spray hydraulics) through its local bridge. Answer the user in their language.",
    "Core rules (ids are in the knowledge pack; look them up with bulc_knowledge_search):",
    "1. The app does the work. If an app tool fails, call bulc_connection_status; if BULC is not connected, never claim an edit or run happened (GEN-018). Use only tools that tools/list shows — older BULC versions lack project_*, sim_*, evac_run and arch_* (then follow the fallbacks in the rules).",
    "2. Units: m, s, kW, kW/m², °C. HVAC module airflow is CFM; pipe-network pressure is MPa while FDS head pressure is bar; K is L/(min·bar^½). XB = [x1,x2,y1,y2,z1,z2], min before max, z is up (GEN-001..003). get_conventions explains the rest.",
    "3. Read before you write: project_info, list_* / get_* / *_list_summary; never invent ids or tools (GEN-005, GEN-008). Projects: project_open / project_save / project_export_fds with absolute paths; ask before discard_unsaved or overwrite (GEN-014).",
    "4. Drawings: ask for the ABSOLUTE local path and call bulc_drawing_intake first; confirm units, scale, origin, story heights and exits; never invent dimensions; do not repeat title-block text (DRW-001..005, GEN-012). Floor plans: arch_analyze_drawing → arch_import_building (dryRun first) or arch_import_floorplan_report for pictures. Piping: spr_analyze_drawing → spr_import_network (dryRun first).",
    "5. Add a fire only when the user asks; HRRPUA = HRR / burner area (GEN-015, FIRE-001). Sprinkler heads and HVAC terminals get unique labels (GEN-021).",
    "6. Before acting on a multi-step plan, run bulc_plan_check. After each batch of edits run validate_project (GEN-006); project_undo reverts the last model edit.",
    "7. Before running: sim_preflight → fix errors → summarise the conditions → user confirmation → sim_start {confirm: true} → sim_status → fire_results_summary / fire_compute_aset. Evacuation: evac_run {confirm: true} → evac_status → evac_get_results. Older apps: validate_project → confirmation → run_simulation (GEN-016, EVAC-004).",
    "8. Sprinkler/HVAC: re-run spr_run_calc / hvac_run_calc after edits, then spr_apply_to_fds / hvac_apply_to_fds (SPR-004, HVAC-003).",
    "9. Prefer dedicated tools; for raw deck edits use preview_fds → edit → fds_apply_text (dryRun first) (GEN-017). capture_view returns a picture of the app for visual checks.",
    "10. Mark code/regulation values as 'verify against the current code text'; report only results a tool returned (GEN-010, LLM-028).",
    `Knowledge: ${ruleCount} rules, ontology, playbooks, glossary and an FDS 6.10.1 key reference as resources (bulc://knowledge/...) and prompts; bulc_get_rules / bulc_knowledge_search for tool-only clients; bulc_check_deck and bulc_mesh_advisor work without the app.`,
  ].join("\n");
}
