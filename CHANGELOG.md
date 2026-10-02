# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
