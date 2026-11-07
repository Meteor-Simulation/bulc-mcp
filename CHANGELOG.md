# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [4.2.0] — 2026-11-07

Tool snapshot and knowledge pack for **BULC 0.103.0**. Older apps keep working with their own (smaller) tool sets.

### Changed

- Tool snapshot: BULC 0.103.0, **298 tools** (293 → 298, none removed; `toolsHash` 009e6dc801dc0d51 = the app's `/health`).
  New: `results_open` (load a deck's results into the app's result viewer — live app only) and the view tools `view_get_state`,
  `view_set_layers`, `view_set`, `view_count_elements` (display layers, 2D/3D, story, render mode, element counts; new category `view`).
- App tools that did nothing without the app now say so: the result viewer tools (`result_set_*`, `result_toggle_playback`,
  `result_add_graph_probe` …), `shape_preview_voxels`, `shape_screenshot` (now marked live-app-only) and `set_run_options` return an
  error instead of a success message when no app screen is attached.
- `result_get_state` lists the result datasets (id, type, label, loaded) and whether results are loaded; `result_set_active_dataset`
  loads a dataset that is not loaded yet (as clicking it in the result tree) and rejects unknown ids; `result_set_legend_range` takes
  `auto_mode` (global | frame); `result_add_graph_probe` opens the graph window and refuses multi-mesh results.
- `view_set` also centres the view on an object or box (`focus`, `focusXb`), hides / shows obstacles one by one (`hideObjects`,
  `showObjects`) and drives the 3D smoke preview (`smokePreview`: on/off, play/pause, quality, speed, density, restart).
- `draw_add_story` takes `below: true` (add a basement under the lowest story).
- `place_furniture` no longer lists `as_fire_source` (the app never read it — fire items are fire sources by category); unknown
  furniture ids, `add_raw_namelist` lines for groups the app writes itself, `merge_meshes` failures, `set_ambient` without values and
  `add_device` particle quantities without `part_id` are reported as errors.
- Knowledge pack: **floorIndex of `hvac_*` is the story id (1F = 1)**, like `spr_*` — the pack said HVAC used the 0-based evacuation
  ordinal (EVAC-001, LLM-014, ontology `floor_identifiers` and `HvacNode`); the evacuation ordinal is counted from the lowest story
  (B1 = 0 when a basement exists). `conventions.app_versions` lists the 0.103 tools. `bulc_plan_check` uses the same wording.

### Added

- 44 rules that the app's tool messages, `validate_project` and the ontology checks cite: evacuation units and RSET lower bound
  (EVAC-009, -010, -012), fire ramps, fire XB and ignition faces (FIRE-015 … -019), holes, surface counts, duplicates, story heights,
  pressure zones and door leakage, shapes outside the mesh (GEO-015 … -021, GEO-024), HVAC node floors, terminals, duct units,
  connectivity, re-applying and localized leaks (HVAC-007 … -015), material pyrolysis and units (**MATL-001 … -011**, new prefix),
  surface heat-flux and ignition conflicts (SURF-003 … -006), zone leakage and `&ZONE` syntax (SIM-012 … -014), pipe-node floors
  (SPR-055) — **213 rules**.
- Ontology classes `PressureZone`, `ZoneLeak`, `ShapeInstance`, `RawNamelist` (83 classes); `Material` links the MATL rules.

## [4.1.0] — 2026-11-02

Tool snapshot and knowledge pack for **BULC 0.101.0**. Older apps keep working with their own (smaller) tool sets.

### Changed

- Tool snapshot: BULC 0.101.0, **293 tools** (239 → 293, none removed; `toolsHash` b12663589b290264 = the app's `/health`).
  New: BIM floor plan and IFC (`bim_import_ifc`, `bim_export_ifc`, `bim_get_model`, `bim_derive_fds`, stairs and elevators),
  pressure zones, leakage and door states (`add_pressure_zone`, `set_zone_leakage`, `set_door_leakage`, `set_door_state` …),
  evacuation FED / alarm / queue / waiting-set settings (`evac_set_fed`, `evac_set_alarm`, `evac_set_queue`,
  `evac_set_waiting_set`), FDS expert keys (`list_expert_keys`, `get_expert_settings`, `set_expert_settings`), Shape Studio
  definitions, placements, sketches, fillet / chamfer / shell and measuring (20 tools in the new `shapeext` category plus
  `shape_add_fillet`, `shape_add_chamfer`, `shape_add_shell`), ontology look-ups (`onto_describe`, `onto_search`,
  `onto_neighbors`, `onto_validate`, `query_objects`), `rename_material`, `preview_material_kinetics`, `hvac_fds_namelist`,
  `spr_set_group`. New `BULC_MCP_TOOLSETS` categories: `shapeext`, `bim`, `pressure`, `expert`, `ontology`.
- `bulc_drawing_intake`: IFC files get a `bim_import_ifc` sequence (dry run → replace or merge after the user agrees →
  `bim_derive_fds`) instead of "IFC is not read by the bridge"; older apps are told to export a DXF plan.
- `bim_export_ifc` is marked as a file writer.
- Knowledge pack: FED coupling and the alarm chain are set with `evac_set_fed` / `evac_set_alarm` on 0.101+ (EVAC-004, playbook 02,
  `FedCoupling` / `Alarm` / `EvacSetup` classes); `&ZONE` and the expert groups are no longer raw-namelist-only (SIM-006);
  `conventions.app_versions` lists the 0.101 tools.

### Added

- Rules cited by the 0.101 tool descriptions: **EVAC-011** (compute the detector activation time when the alarm chain is on),
  **GEO-022** (shapes thinner than a mesh cell vanish from the voxel obstruction), **GEO-023** (put shape fire faces on planar
  faces) — 169 rules.

## [4.0.0] — unreleased

First release under the Meteor-Simulation organisation. Continues `bulc-mcp-server` 3.0.0 (the thin bridge client).
Recommended with BULC 0.90 or later; BULC 0.88 works with its smaller tool set.

### Added

- **Knowledge pack** (`knowledge/`): domain ontology (79 classes, YAML + JSON-LD, app-version notes), 166 machine-readable rules
  with condition → check → fix, 38 common LLM mistakes, six playbooks (drawing → fire → ASET, evacuation + FED → RSET, HVAC smoke
  control, sprinkler design, marine water spray from piping ISO drawings, troubleshooting), Korean–English–FDS–tool glossary and
  an FDS 6.10.1 key reference with common input errors.
- MCP **resources** for the knowledge pack, per-rule / per-domain / per-class / per-namelist templates, tool cards, synthetic
  examples and two live views of the project open in the app.
- MCP **prompts**: `bulc-start`, `drawing-to-fire-aset`, `evacuation-rset`, `hvac-smoke-control`, `sprinkler-design`,
  `marine-water-spray-iso`, `troubleshooting`, `review-fds-deck` (Korean and English titles).
- Initialization **instructions** with the core rules (project_* files, sim_preflight → consent → sim_start, evac_run order,
  arch_* drawing import, fallbacks for older apps).
- Local tools: `bulc_knowledge_search`, `bulc_get_rules`, `bulc_plan_check` (checks a planned tool sequence against the rules and
  the live tool schemas — including unique head/terminal labels, dry runs before drawing imports, sim_preflight before sim_start,
  run consent and the evacuation run order), `bulc_drawing_intake` (local classification of DWG/DXF/PDF/image/ZIP/IFC/.fds files,
  arch_* / spr_* sequences, DXF wall candidates for older apps), `bulc_check_deck` (deterministic FDS 6.10.1 deck lint),
  `bulc_mesh_advisor` (D*, cell size, 2·3·5 cell counts), `bulc_find_tools`, and `bulc_call` for the new `compact` profile.
- **Bridge discovery**: the server reads the discovery file the app writes (`BULC/bridge.json` in the user's config folder) to find
  the bridge address and token — no port configuration, also when the app runs on a non-default port. Stale files (process gone)
  and non-loopback addresses are ignored. `BULC_BRIDGE_DISCOVERY_FILE` and `BULC_BRIDGE_TOKEN` added.
- **Bridge token**: `Authorization: Bearer` is sent (to the address it belongs to) when the app runs with `BULC_BRIDGE_AUTH`;
  401 answers explain how to provide it.
- App pictures (`capture_view`, newer `shape_screenshot`) are attached as image content; structured app results (`data`, e.g.
  `sim_preflight`, `fire_compute_aset`) are passed on as `structuredContent`.
- Tool **annotations** (read-only, destructive, idempotent, open-world — the app's own annotations win), "Live app only" marks,
  side-effect notes and rule-id hints on app tools; notes and hints never push a description past 1,024 characters.
- `bulc_connection_status` reports how the bridge was found and compares the app's tool-set hash with the bundled snapshot.
- `tools/list_changed` notifications when the app starts, stops, moves to another port or changes its tool set.
- Bridge **identification** (a foreign program on the port is reported, not used), loopback guard, longer time-outs for drawing
  analysis, result reading, project open/save and exports.
- Configuration: `BULC_MCP_PROFILE`, `BULC_MCP_TOOLSETS`, `BULC_MCP_HIDE_TOOLS`, `BULC_MCP_HINTS`, `BULC_MCP_MAX_DESCRIPTION`,
  `BULC_MCP_CALL_TIMEOUT_MS`, `BULC_MCP_WATCH_MS`, `BULC_MCP_ATTACH_IMAGES`, `BULC_MCP_ALLOW_REMOTE`.
- Synthetic examples (floor-plan DXF, water-spray ISO DXF, FDS decks, example sessions) and a test suite with a stub bridge.

### Changed

- Package renamed to `@meteor-simulation/bulc-mcp`; binary `bulc-mcp`; entry point `build/server.js`.
- `run_simulation` now runs the app's `validate_project` first and does not start when it reports errors (kept for every app
  version; `sim_preflight` → `sim_start` is preferred on BULC 0.90+).
- App replies that start with `Tool input error`, `Unknown tool`, `Tool error (` or `.fds 생성 실패` are returned as errors
  (`isError`) with a pointer to the relevant rule and the real tool names.
- Tool snapshot: BULC 0.90.0, 239 tools (adds project_*, sim_*, fire_*, evac_run/status/stop/get_results, arch_*, capture_view,
  fds_apply_text, get_conventions, output_add_tenability_slices; the app-only `rewrite_fds_via_ai` and `request_simulation_run`
  are no longer listed) in snapshot schema 2 (`appVersion`, `generatedAt`, `sha256`, `toolsHash`, `category`, `annotations`,
  `liveOnly`). `scripts/import-snapshot.mjs` keeps the app's tool objects unchanged so `toolsHash` equals the app's `/health`.
- Node.js 20 or newer is required. `build/` is no longer committed. Icon is 512 × 512.
- Privacy policy rewritten for the HTTP bridge and the discovery file; contact through GitHub.

## [3.0.0]

- Thin client of the BULC desktop app's HTTP bridge: tools listed live from the app with a bundled snapshot as fallback.
