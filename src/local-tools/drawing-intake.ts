// bulc_drawing_intake — classify a local drawing file and hand back the playbook, the questions to
// ask, and the tool sequence. The file is read on this PC only; nothing is uploaded by this tool.
import fs from "node:fs";
import path from "node:path";
import { readDxf, isAsciiDxf, wallCandidates, type DxfInfo } from "../drawing/dxf.js";
import { sniffDwg, sniffIfc, sniffImage, sniffPdf, sniffZip } from "../drawing/sniff.js";
import { text } from "../results.js";
import { argBool, argNumber, argString, obj, readOnly, type LocalTool } from "./types.js";

type Kind = "architectural_plan" | "sprinkler_plan" | "piping_isometric" | "hvac_plan" | "fds_deck" | "bulc_project" | "unknown";

const KW: Record<"architectural_plan" | "sprinkler_plan" | "piping_isometric" | "hvac_plan", RegExp> = {
  architectural_plan: /(a[-_ ]?wall|\bwall|벽|door|\b문\b|창호|window|\bwin\b|stair|계단|room|column|\bcol\b|기둥|grid|furn|가구|arch|건축|평면|floor[-_ ]?plan|layout)/i,
  sprinkler_plan: /(\bspr\b|spr[-_]|sprink|스프링클러|\bhead|헤드|\bfp\b|f[-_]p[-_]|fire[-_ ]?pipe|소화설비|소화배관|alarm[-_ ]?valve|습식|건식|준비작동)/i,
  piping_isometric: /(\biso\b|iso[-_]|isometric|아이소|nozzle|\bnoz|노즐|water[-_ ]?spray|물분무|deluge|일제살수|drencher|flange|reducer|line[-_ ]?no|계통도)/i,
  hvac_plan: /(duct|덕트|hvac|diffuser|디퓨저|grille|그릴|\bahu|exhaust|\bexh\b|supply[-_ ]?air|급기|배기|제연|smoke[-_ ]?vent|damper|댐퍼|공조)/i,
};
const PIPING = /(pipe|배관|valve|vlv|밸브)/i;

const PLAYBOOK: Record<Kind, string | null> = {
  architectural_plan: "01-architectural-drawing-fire-aset",
  sprinkler_plan: "04-sprinkler-design-fds-activation",
  piping_isometric: "05-marine-water-spray-iso",
  hvac_plan: "03-hvac-smoke-control",
  fds_deck: "06-troubleshooting",
  bulc_project: null,
  unknown: null,
};

const DRAWING_EXT = new Set([".dxf", ".dwg", ".pdf", ".png", ".jpg", ".jpeg", ".zip", ".ifc", ".tif", ".tiff", ".bmp"]);
const MAX_READ = 40 * 1024 * 1024;

function readHead(file: string, bytes: number): Buffer {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

const CODEPAGES: Record<string, string> = {
  ANSI_949: "euc-kr",
  ANSI_932: "shift_jis",
  ANSI_936: "gbk",
  ANSI_950: "big5",
  ANSI_1250: "windows-1250",
  ANSI_1251: "windows-1251",
  ANSI_1252: "windows-1252",
};

/** DXF before AutoCAD 2007 (AC1021) is written in the drawing's ANSI code page; later versions are UTF-8. */
function decodeDxf(buf: Buffer): string {
  const probe = buf.subarray(0, 64 * 1024).toString("latin1");
  const ver = probe.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/)?.[1];
  const cp = probe.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/)?.[1]?.toUpperCase();
  if (ver && ver < "AC1021" && cp && CODEPAGES[cp]) {
    try {
      return new TextDecoder(CODEPAGES[cp]).decode(buf);
    } catch {
      /* runtime without that encoding — fall through */
    }
  }
  return buf.toString("utf8");
}

function topEntries(rec: Record<string, number>, n: number): [string, number][] {
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function sequence(kind: Kind, p: string, opts: { units?: string; layers?: string[] }): string[] {
  const P = JSON.stringify(p);
  switch (kind) {
    case "architectural_plan":
      return [
        "bulc_connection_status {}",
        "project_info {}   ← file, unsaved changes, stories (zMin, height). Older BULC: get_project_summary {} + draw_list_stories {}",
        "(ask) which story, story height, origin, which doors are final exits; confirm units if the drawing does not state them (DRW-001, DRW-002, EVAC-003)",
        `arch_analyze_drawing {"filePath": ${P}}   ← walls, doors, windows, columns, rooms, levels + questions; images / outlined PDFs return needsVision (DRW-004)`,
        "arch_analyze_drawing {\"candidateId\": \"<id>\", \"show\": \"walls\"}   ← tabulate for the user (DRW-003); options {scaleMmPerUnit, wallLayers …} to re-analyse",
        "(needsVision) read the picture yourself → arch_import_floorplan_report {\"report\": {...}, \"imagePath\": ...}   ← dryRun by default",
        "arch_import_building {\"candidateId\": \"<id>\", \"story\": <story id>}   ← dryRun (default): counts, size, suggestedMesh, warnings — confirm with the user",
        "arch_import_building {\"candidateId\": \"<id>\", \"story\": <story id>, \"dryRun\": false}   ← one undo step (project_undo); doors 'Door_' = exits, windows 'Win_' (EVAC-003)",
        "list_obstacles {}; capture_view {\"view\": \"2d\", \"story\": <story id>}   ← check the result visually",
        "(upper stories) draw_add_story {...} → arch_import_building with the same transform.origin; slabs: include.ceilingSlab or add_floor (GEO-007)",
        "bulc_mesh_advisor {\"hrr_kw\": <design HRR>, \"domain_xb\": [...]} → set_mesh {...} (or the suggestedMesh) / auto_multimesh {...}",
        "set_all_boundaries_open {\"faces\": [\"XMIN\", \"XMAX\", \"YMIN\", \"YMAX\", \"ZMAX\"]}   ← if the building is open to outside (VENT-002)",
        "(only if the user asked for a fire) add_fire {...} — GEN-015",
        "output_add_tenability_slices {}; set_time {\"t_end\": ...}; update_dump_config {...}",
        "sim_preflight {}   ← ok=false → fix, then summarise the conditions and ask (GEN-016)",
        "project_save {\"path\": \"<absolute>.bulc\"} → sim_start {\"confirm\": true} → sim_status {} … → fire_results_summary {} → fire_compute_aset {}",
        "(older BULC without arch_*) bulc_drawing_intake {\"path\": ..., \"extract_geometry\": true} → confirmed add_wall / add_door {\"id\": \"Door_EXIT_1\"} / add_window {\"id\": \"Win_1\"} → validate_project → run_simulation",
        "bulc_plan_check {\"steps\": [...]} before you start calling edit tools",
      ];
    case "sprinkler_plan":
      return [
        "bulc_connection_status {}",
        `spr_analyze_drawing {"filePath": ${P}, "options": {"projection": "plan", "planHeightM": <head height>}}`,
        "spr_analyze_drawing {\"candidateId\": \"<id>\", \"show\": \"summary\"}   ← confirm layers, head blocks, ambiguities with the user (DRW-006)",
        "spr_import_network {\"candidateId\": \"<id>\", \"mode\": \"replace\", \"dryRun\": true, \"defaults\": {\"kFactor\": <metric K>, \"nozzleKind\": \"closed\"}}",
        "spr_import_network {\"candidateId\": \"<id>\", \"mode\": \"replace\", \"defaults\": {...}}",
        "spr_list_summary {}   ← read generated ids (GEN-008); add the water source with spr_add_water_source; heads added by hand get unique labels (GEN-021)",
        "spr_run_calc {\"mode\": \"design\"}",
        "spr_get_results {\"detail\": \"zones\"}",
        "spr_design_review {}   ← clear errors (SPR-040)",
        "spr_apply_to_fds {}   ← FDS heads from calculated flows (SPR-020)",
        "validate_project {}",
      ];
    case "piping_isometric":
      return [
        "bulc_connection_status {}",
        `spr_analyze_drawing {"filePath": ${P}}`,
        "spr_analyze_drawing {\"candidateId\": \"<id>\", \"show\": \"runs\"}; spr_analyze_drawing {\"candidateId\": \"<id>\", \"show\": \"tags\"}",
        "(ask) open ends = drains?, reference/dashed lines to exclude, zone ↔ line-number table, nozzle K and required pressure, fluid (sea/fresh) (DRW-006, DRW-007, SPR-025)",
        "spr_import_network {\"candidateId\": \"<id>\", \"mode\": \"replace\", \"dryRun\": true, \"excludeLines\": [...], \"zoneByLine\": {...}, \"defaults\": {\"nozzleKind\": \"open\", \"kFactor\": <K>, \"requiredPressure\": <MPa>}}",
        "spr_import_network {... same, without dryRun}",
        "spr_set_defaults {\"operation\": \"zone_deluge\"}",
        "spr_run_calc {\"mode\": \"design\"}; spr_get_results {\"detail\": \"zones\", \"at\": \"design\"}",
        "spr_pump_sizing {\"mode\": \"from_design\", \"fluid\": \"sea\" | \"fresh\"}",
        "spr_design_review {}",
        "spr_export_results {\"outputDir\": \"<absolute folder>\", \"format\": \"both\"}",
      ];
    case "hvac_plan":
      return [
        "bulc_connection_status {}",
        "(ask) system type (exhaust / supply / pressurisation), airflow per terminal and its unit, duct sizes (HVAC-001)",
        "hvac_add_node {\"x\": ..., \"y\": ..., \"z\": <just below the ceiling>, \"type\": \"...\", \"label\": \"EX1\"} … hvac_list_summary {}   ← unique labels (GEN-021), read node ids (GEN-008)",
        "hvac_add_duct {\"startNodeId\": \"...\", \"endNodeId\": \"...\", \"diameter\": <mm>}",
        "hvac_add_exhaust_grille / hvac_add_supply_diffuser {\"nodeId\": \"...\", \"airflowCFM\": <CFM>}",
        "hvac_run_calc {}; hvac_get_results {}",
        "hvac_apply_to_fds {}   ← then size terminals realistically (HVAC-004)",
        "validate_project {}",
      ];
    case "fds_deck":
      return [
        `bulc_check_deck {"path": ${P}}   ← deterministic lint, works without the app`,
        `(if it should become the current project, after the user agreed) project_open {"path": ${P}}   ← refuses on unsaved changes; older BULC: File > Open (GEN-014)`,
        "validate_project {} / sim_preflight {} after opening, then fix with dedicated tools; for raw edits preview_fds → fds_apply_text {dryRun} (GEN-017)",
      ];
    case "bulc_project":
      return [
        "bulc_connection_status {}",
        `(after the user agreed) project_open {"path": ${P}}   ← older BULC: ask the user to open it with File > Open (GEN-014)`,
        "project_info {}   ← stories, counts, deck path",
      ];
    default:
      return ["(ask the user) what the file shows and what it is for", "bulc_knowledge_search {\"query\": \"drawing\"}"];
  }
}

function questions(kind: Kind, info: { unitsKnown: boolean; raster: boolean }): string[] {
  const q: string[] = [];
  if (!info.unitsKnown) q.push("도면 단위는 무엇입니까(mm, m, inch)? / What are the drawing units? (DRW-001)");
  if (info.raster) q.push("축척: 실제 거리를 아는 두 점(예: 기둥 간격 8.0 m)을 알려 주세요. / Give two points with a known real distance to fix the scale. (DRW-001)");
  q.push("기준점(0,0)과 방향을 어디로 둘까요? / Which point is the origin (0,0) and which way is +x? (DRW-002)");
  if (kind === "architectural_plan")
    q.push(
      "해석할 층과 층고·슬래브 두께는? / Which stories, story height and slab thickness?",
      "어느 레이어가 벽·문·창입니까? 최종 출구 문은 어디입니까? / Which layers are walls, doors, windows? Which doors are final exits? (EVAC-003)",
      "용도와 화재 시나리오(위치·최대 HRR·성장)는? 없으면 화원을 만들지 않습니다. / Occupancy and fire scenario? (GEN-015)",
    );
  if (kind === "sprinkler_plan")
    q.push(
      "헤드 종류·K(L/min/bar^½)·작동 온도·RTI 는? / Head type, metric K, activation temperature, RTI? (SPR-010)",
      "설계 기준과 설계 개방 헤드 수는? 수원 조건은? / Design standard, number of design heads, water supply data? (SPR-017, SPR-001)",
    );
  if (kind === "piping_isometric")
    q.push(
      "노즐 K 와 요구 방사압(MPa)은 사양서 기준으로 얼마입니까? / Nozzle K and required pressure (MPa) from the datasheet? (SPR-025)",
      "라인 번호 ↔ 구역 대응표와 제외할 참조선은? / Line-number → zone table and reference lines to exclude? (SPR-022, DRW-007)",
      "열린 끝은 드레인입니까(상시 개방/운전 중 닫힘)? 해수입니까? / Are open ends drains? Sea water? (SPR-023, SPR-032)",
    );
  if (kind === "hvac_plan") q.push("단말별 풍량과 단위(CFM, m³/h)는? / Airflow per terminal and its unit? (HVAC-001)");
  return q;
}

export const drawingIntake: LocalTool = {
  def: {
    name: "bulc_drawing_intake",
    title: "Drawing intake",
    description:
      "First step for any drawing the user gives (DWG, DXF, PDF, image, ZIP bundle, IFC, or an .fds deck). Pass the ABSOLUTE local path. " +
      "Reads the file on this PC only — it never uploads anything — and classifies it (architectural plan, sprinkler plan, piping isometric, " +
      "HVAC plan, FDS deck) from the extension, file name, DXF units/layers/blocks/line angles, PDF pages and fonts, ZIP contents or IFC " +
      "entities. Returns the playbook to follow, the questions to ask the user (units, scale, origin, layers …) and the tool sequence " +
      "(architectural plans → arch_analyze_drawing / arch_import_building, piping → spr_analyze_drawing / spr_import_network). " +
      "For DXF plans, extract_geometry=true also returns wall centre-line candidates in metres (fallback for older apps). Text inside the drawing " +
      "(title blocks, notes) is never returned. 도면 파일을 로컬에서 분류하고 플레이북·질문·도구 순서를 돌려줍니다(업로드 없음).",
    inputSchema: obj(
      {
        path: { type: "string", description: "Absolute path of the file on this PC" },
        purpose: { type: "string", enum: ["auto", "fire", "evacuation", "sprinkler", "water_spray", "hvac"], description: "What the user wants to do with it (default auto)" },
        extract_geometry: { type: "boolean", description: "DXF only: return wall centre-line candidates (metres, origin at the drawing's lower-left)" },
        wall_layers: { type: "array", items: { type: "string" }, description: "DXF layers to take wall lines from (default: layers whose name looks like walls)" },
        units: { type: "string", enum: ["mm", "cm", "m", "inch", "ft"], description: "Override the drawing units when the file does not state them" },
        max_walls: { type: "number", description: "Maximum wall candidates (default 150)" },
      },
      ["path"],
    ),
    annotations: { title: "Drawing intake", ...readOnly },
  },
  async run(args) {
    const p = argString(args, "path");
    if (!p) return text("path 가 필요합니다 / path is required.", true);
    if (!path.isAbsolute(p))
      return text(
        `'${p}' 는 절대 경로가 아닙니다. 사용자에게 이 PC 의 전체 경로(예: D:\\work\\plan.dxf)를 받으세요(GEN-012). 채팅 첨부 파일은 MCP 서버가 읽을 수 없습니다.\n` +
          `'${p}' is not an absolute path. Ask the user for the full local path; chat attachments are not visible to this server.`,
        true,
      );
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      return text(`파일이 없습니다 / file not found: ${p}`, true);
    }
    if (!st.isFile()) return text(`파일이 아닙니다 / not a file: ${p}`, true);

    const ext = path.extname(p).toLowerCase();
    const base = path.basename(p);
    const purpose = argString(args, "purpose") ?? "auto";
    const evidence: string[] = [];
    const facts: string[] = [`file: ${base} · ${ext || "(no extension)"} · ${(st.size / 1024).toFixed(1)} KiB`];
    const score: Record<string, number> = { architectural_plan: 0, sprinkler_plan: 0, piping_isometric: 0, hvac_plan: 0 };
    const bump = (k: keyof typeof KW, w: number, why: string) => {
      score[k] += w;
      evidence.push(`${k} +${w}: ${why}`);
    };
    let kind: Kind = "unknown";
    let unitsKnown = false;
    let raster = false;
    let dxf: DxfInfo | null = null;
    let wallLayerGuess: string[] = [];

    for (const k of Object.keys(KW) as (keyof typeof KW)[]) if (KW[k].test(base)) bump(k, 3, "file name");
    if (PIPING.test(base)) {
      score.sprinkler_plan += 1;
      score.piping_isometric += 1;
    }

    if (ext === ".fds") kind = "fds_deck";
    else if (ext === ".bulc") kind = "bulc_project";
    else if (!DRAWING_EXT.has(ext)) {
      facts.push("not a recognised drawing type");
    } else if (ext === ".dxf") {
      const buf = readHead(p, Math.min(st.size, MAX_READ));
      const head = buf.subarray(0, 64).toString("latin1");
      if (head.startsWith("AutoCAD Binary DXF")) {
        facts.push("binary DXF — only the BULC app (spr_analyze_drawing) or a converter can read it");
      } else {
        const t = decodeDxf(buf);
        if (!isAsciiDxf(t)) facts.push("does not look like an ASCII DXF");
        dxf = readDxf(t);
        if (st.size > MAX_READ) facts.push(`read the first ${MAX_READ / 1024 / 1024} MiB only`);
        unitsKnown = dxf.metresPerUnit !== null;
        facts.push(`DXF ${dxf.acadVersion ?? "?"} · units ${dxf.unitName}${dxf.insunits !== undefined ? ` ($INSUNITS=${dxf.insunits})` : ""}`);
        if (dxf.extMin && dxf.extMax) facts.push(`extents: x ${dxf.extMin[0].toFixed(1)}…${dxf.extMax[0].toFixed(1)}, y ${dxf.extMin[1].toFixed(1)}…${dxf.extMax[1].toFixed(1)} (drawing units)`);
        facts.push(`entities: ${topEntries(dxf.entityCounts, 10).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
        const layers = topEntries(dxf.layerCounts, 30);
        facts.push(`layers (by entity count): ${layers.map(([k, v]) => `${k}(${v})`).join(", ") || "none"}`);
        const blocks = topEntries(dxf.blockCounts, 15);
        if (blocks.length) facts.push(`block references: ${blocks.map(([k, v]) => `${k}×${v}`).join(", ")}`);
        facts.push(`text entities: ${dxf.textCount} (contents not shown) · dimensions: ${dxf.dimensionCount}`);
        facts.push(`line angles: ${(dxf.orthoShare * 100).toFixed(0)} % orthogonal, ${(dxf.isoAngleShare * 100).toFixed(0)} % on 30°/150° isometric axes`);
        const allLayers = new Set([...dxf.layersDeclared, ...Object.keys(dxf.layerCounts)]);
        for (const k of Object.keys(KW) as (keyof typeof KW)[]) {
          const m = [...allLayers].filter((l) => KW[k].test(l));
          if (m.length) bump(k, Math.min(6, m.length * 2), `layers ${m.slice(0, 4).join(", ")}`);
        }
        for (const k of Object.keys(KW) as (keyof typeof KW)[]) {
          const m = Object.keys(dxf.blockCounts).filter((b) => KW[k].test(b));
          if (m.length) bump(k, Math.min(4, m.length * 2), `blocks ${m.slice(0, 4).join(", ")}`);
        }
        if (dxf.isoAngleShare > 0.2) bump("piping_isometric", 4, "many lines on isometric axes");
        if (dxf.orthoShare > 0.7) {
          score.architectural_plan += 1;
          score.sprinkler_plan += 1;
        }
        wallLayerGuess = [...allLayers].filter((l) => /wall|벽/i.test(l));
      }
    } else if (ext === ".dwg") {
      const v = sniffDwg(readHead(p, 16));
      facts.push(v ? `DWG ${v.version} (AutoCAD ${v.release}) — content is read by the BULC app (it converts DWG locally)` : "not a DWG file (bad header)");
    } else if (ext === ".pdf") {
      const info = sniffPdf(readHead(p, Math.min(st.size, MAX_READ)));
      if (info) {
        facts.push(`PDF ${info.version} · ${info.pages} page(s) · ${info.hasFonts ? "has text fonts" : "no fonts — text is probably outlined (DRW-008, needs vision)"}${info.encrypted ? " · encrypted" : ""}`);
        raster = true;
      } else facts.push("not a PDF (bad header)");
    } else if (ext === ".zip") {
      const entries = sniffZip(readHead(p, Math.min(st.size, MAX_READ))) ?? [];
      const byExt: Record<string, number> = {};
      for (const e of entries) {
        const x = path.extname(e.name).toLowerCase() || "(none)";
        byExt[x] = (byExt[x] ?? 0) + 1;
        for (const k of Object.keys(KW) as (keyof typeof KW)[]) if (KW[k].test(e.name)) score[k] += 1;
      }
      facts.push(`ZIP: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} — ${Object.entries(byExt).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      if ((byExt[".dwg"] ?? 0) + (byExt[".dxf"] ?? 0) + (byExt[".pdf"] ?? 0) > 1) evidence.push("a bundle of several drawings (typical for ISO sheets)");
    } else if (ext === ".ifc") {
      const info = sniffIfc(readHead(p, Math.min(st.size, MAX_READ)).toString("utf8"));
      if (info) {
        facts.push(`IFC ${info.schema ?? "?"} · ${Object.entries(info.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "no building elements found"}`);
        unitsKnown = true;
        const c = info.counts;
        if ((c.IFCWALL ?? 0) + (c.IFCWALLSTANDARDCASE ?? 0) + (c.IFCDOOR ?? 0) > 0) bump("architectural_plan", 5, "IFC walls/doors");
        if (c.IFCDUCTSEGMENT) bump("hvac_plan", 2, "IFC ducts");
        if (c.IFCPIPESEGMENT || c.IFCFIRESUPPRESSIONTERMINAL) bump("sprinkler_plan", 2, "IFC pipes / fire-suppression terminals");
      } else facts.push("not an IFC STEP file");
      facts.push("IFC is not read by the BULC bridge tools; use the app's CAD/BIM import (scope depends on the app version) or extract walls manually");
    } else {
      const img = sniffImage(readHead(p, 256 * 1024));
      facts.push(img ? `${img.format.toUpperCase()} image ${img.width}×${img.height} px — no units; the scale must come from the user (DRW-001)` : "image");
      raster = true;
    }

    if (purpose === "fire" || purpose === "evacuation") bump("architectural_plan", 5, `purpose=${purpose}`);
    if (purpose === "sprinkler") bump("sprinkler_plan", 5, "purpose=sprinkler");
    if (purpose === "water_spray") bump("piping_isometric", 5, "purpose=water_spray");
    if (purpose === "hvac") bump("hvac_plan", 5, "purpose=hvac");

    let confidence = "high";
    if (kind === "unknown" && DRAWING_EXT.has(ext)) {
      const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
      if (ranked[0][1] > 0) {
        kind = ranked[0][0] as Kind;
        const margin = ranked[0][1] - ranked[1][1];
        confidence = margin >= 4 ? "high" : margin >= 2 ? "medium" : "low";
      } else {
        kind = "architectural_plan";
        confidence = "low";
        evidence.push("no specific hints — assumed an architectural plan; confirm with the user");
      }
    }

    const unitsOverride = argString(args, "units");
    const UNIT_M: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, inch: 0.0254, ft: 0.3048 };
    const out: string[] = [];
    out.push(`kind: ${kind} (confidence ${confidence})`);
    out.push(...facts.map((f) => `- ${f}`));
    if (evidence.length) out.push(`evidence: ${evidence.join("; ")}`);
    const pb = PLAYBOOK[kind];
    if (pb) out.push(`playbook: bulc://knowledge/playbooks/${pb}`);

    if (dxf && argBool(args, "extract_geometry")) {
      const mpu = unitsOverride ? UNIT_M[unitsOverride] : dxf.metresPerUnit;
      const layers = Array.isArray(args.wall_layers) && (args.wall_layers as unknown[]).length ? (args.wall_layers as unknown[]).map(String) : wallLayerGuess;
      if (!mpu) {
        out.push("", "wall candidates: not extracted — the drawing does not state its units. Ask the user and call again with units=\"mm\" (or m, cm, inch, ft). (DRW-001)");
      } else if (!layers.length) {
        out.push("", "wall candidates: no wall-like layer found. Ask the user which layers hold walls and pass wall_layers=[...].");
      } else {
        const segs = dxf.segments.filter((s) => layers.includes(s.layer));
        const xs = segs.flatMap((s) => [s.x1, s.x2]);
        const ys = segs.flatMap((s) => [s.y1, s.y2]);
        const origin: [number, number] = xs.length ? [Math.min(...xs), Math.min(...ys)] : [0, 0];
        const limit = Math.max(1, Math.floor(argNumber(args, "max_walls") ?? 150));
        const walls = wallCandidates(segs, mpu, origin, limit);
        const sizeX = xs.length ? ((Math.max(...xs) - origin[0]) * mpu).toFixed(2) : "0";
        const sizeY = ys.length ? ((Math.max(...ys) - origin[1]) * mpu).toFixed(2) : "0";
        out.push(
          "",
          `wall candidates from layers ${layers.join(", ")} — ${walls.length} (units ${unitsOverride ?? dxf.unitName} → m, origin = drawing point (${origin[0]}, ${origin[1]}), footprint ≈ ${sizeX} × ${sizeY} m):`,
          "these are CANDIDATES — show them to the user as a table and get confirmation before add_wall (DRW-003). thickness 0 = single line; ask for the thickness.",
          ...walls.map((w, i) => `  ${i + 1}. start [${w.start.join(", ")}] end [${w.end.join(", ")}] thickness ${w.thickness} (${w.layer})`),
        );
        const doors = dxf.inserts.filter((x) => /door|문|dr\b/i.test(x.block) || /door|문/i.test(x.layer));
        if (doors.length)
          out.push(
            `door block references: ${doors.length} — e.g. ${doors
              .slice(0, 10)
              .map((d) => `[${(((d.x - origin[0]) * mpu) as number).toFixed(2)}, ${(((d.y - origin[1]) * mpu) as number).toFixed(2)}] ${d.block}`)
              .join("; ")}`,
          );
      }
    } else if (dxf && kind === "architectural_plan") {
      out.push(
        "",
        `the BULC app recognises this plan itself (arch_analyze_drawing, BULC 0.89+); wall lines can also be listed here with extract_geometry=true${wallLayerGuess.length ? ` (wall-like layers: ${wallLayerGuess.slice(0, 6).join(", ")})` : " and wall_layers=[...]"}.`,
      );
    }

    out.push("", "ask the user / 사용자에게 물을 것:", ...questions(kind, { unitsKnown: unitsKnown || !!unitsOverride, raster }).map((q) => `- ${q}`));
    out.push("", "tool sequence / 도구 순서:", ...sequence(kind, p, { layers: wallLayerGuess }).map((s, i) => `${i + 1}. ${s}`));
    out.push(
      "",
      "rules: DRW-001 (units/scale first), DRW-002 (datum), DRW-003 (tabulate and confirm), DRW-005 (transfer only what is needed), GEN-012 (keep drawings local), GEN-011 (no invented values)",
      "privacy: this tool read the file locally and sent nothing anywhere. Whatever you repeat from it becomes part of the conversation with your AI provider — do not copy title-block text, company names or drawing numbers (DRW-005).",
    );
    return { content: [{ type: "text", text: out.join("\n") }], structuredContent: { kind, confidence, playbook: pb, unitsKnown: unitsKnown || !!unitsOverride } };
  },
};
