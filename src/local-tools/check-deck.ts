// bulc_check_deck — deterministic FDS deck lint (deck text, a local .fds path, or the app's current deck).
import fs from "node:fs";
import path from "node:path";
import { BridgeError } from "../bridge.js";
import { lintDeck } from "../fds/lint.js";
import { text } from "../results.js";
import { argBool, argString, obj, readOnly, type LocalTool } from "./types.js";

const MAX_DECK = 4 * 1024 * 1024;
const RANK = { error: 0, warning: 1, info: 2 } as const;

export const checkDeck: LocalTool = {
  def: {
    name: "bulc_check_deck",
    title: "Check an FDS deck",
    description:
      "Deterministic FDS 6.10.1 deck check with rule ids: mesh XB/IJK, cell aspect ratio, 2·3·5 cell counts, multi-mesh overlaps and " +
      "cell ratios, objects and devices outside the meshes, VENT planes, undefined SURF/MATL/PROP/PART/RAMP/CTRL references, HRRPUA " +
      "without &REAC, total HRR and D*/dx, dump intervals ≥ T_END, missing OPEN boundary or SLCF, detector/sprinkler PROP data, " +
      "spray flow keys, CHID. Give deck_text, a local .fds path, or from_app=true for the deck of the project open in BULC. " +
      "Complements validate_project (which also checks app-side state). FDS 덱을 규칙 id 와 함께 결정적으로 점검합니다.",
    inputSchema: obj({
      deck_text: { type: "string", description: "FDS input text" },
      path: { type: "string", description: "Absolute path of a local .fds file (≤ 4 MB)" },
      from_app: { type: "boolean", description: "Check the deck of the project open in the BULC app (uses preview_fds)" },
      min_severity: { type: "string", enum: ["error", "warning", "info"], description: "Hide findings below this severity (default info)" },
    }),
    annotations: { title: "Check an FDS deck", ...readOnly },
  },
  async run(args, ctx) {
    let deck = argString(args, "deck_text");
    let fileName: string | undefined;
    const p = argString(args, "path");
    if (!deck && p) {
      if (!path.isAbsolute(p)) return text(`'${p}' 는 절대 경로가 아닙니다 / not an absolute path.`, true);
      try {
        const st = fs.statSync(p);
        if (st.size > MAX_DECK) return text(`덱이 너무 큽니다(${(st.size / 1048576).toFixed(1)} MB > 4 MB) / deck too large.`, true);
        deck = fs.readFileSync(p, "utf8");
        fileName = path.basename(p);
      } catch {
        return text(`파일을 읽을 수 없습니다 / cannot read: ${p}`, true);
      }
    }
    if (!deck && argBool(args, "from_app")) {
      try {
        const r = await ctx.bridge.callTool("preview_fds", { max_lines: 1_000_000 }, ctx.cfg.callTimeoutMs);
        deck = r.message;
      } catch (err) {
        if (err instanceof BridgeError) return text(err.message, true);
        throw err;
      }
    }
    if (!deck) return text("deck_text, path, from_app 중 하나가 필요합니다 / give deck_text, path or from_app=true.", true);

    const { findings, summary } = lintDeck(deck, { fileName });
    const min = (argString(args, "min_severity") ?? "info") as keyof typeof RANK;
    const shown = findings.filter((f) => RANK[f.severity] <= (RANK[min] ?? 2));
    const counts = { error: 0, warning: 0, info: 0 };
    for (const f of findings) counts[f.severity]++;
    const lines: string[] = [];
    lines.push(`bulc_check_deck: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} note(s) · ${summary.records} namelist records`);
    lines.push(
      `deck: CHID ${summary.chid ?? "(none)"} · T_END ${summary.tEnd ?? "(not set → 1 s)"} s · ${summary.meshes.length} mesh(es), ${summary.totalCells.toLocaleString("en-US")} cells` +
        (summary.minCell ? ` · finest cell ${summary.minCell.toFixed(3)} m` : ""),
    );
    if (summary.fires.length)
      lines.push(
        `fire: ${summary.totalHrrKw.toFixed(0)} kW total from ${summary.fires.length} burner face(s)` +
          (summary.dStar ? ` · D* ${summary.dStar.toFixed(2)} m · D*/dx ${summary.dStarOverDx?.toFixed(1)}` : ""),
      );
    lines.push("");
    if (!shown.length) lines.push(findings.length ? `(${findings.length} finding(s) below ${min})` : "찾은 문제가 없습니다 / no findings.");
    for (const f of shown) {
      const where = [f.group ? `&${f.group}` : "", f.id ? `'${f.id}'` : "", f.line ? `line ${f.line}` : ""].filter(Boolean).join(" ");
      lines.push(`- [${f.severity}] ${f.rule}${where ? ` (${where})` : ""}: ${f.message}${f.fixTools?.length ? ` → ${f.fixTools.join(", ")}` : ""}`);
    }
    lines.push("", "규칙 원문 / rule text: bulc_knowledge_search \"<rule id>\". 앱에서 고칠 때는 전용 도구를 쓰고 validate_project 로 다시 확인하세요(GEN-017, GEN-006).");
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { counts, findings, summary } };
  },
};
