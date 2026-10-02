// bulc_mesh_advisor — D*, cell sizes for D*/dx = 4, 10, 16 and 2·3·5-friendly cell counts.
import { characteristicDiameter, isFftFriendly, nearestFftFriendly } from "../fds/physics.js";
import { text } from "../results.js";
import { argNumber, argString, obj, readOnly, type LocalTool } from "./types.js";

const QUALITY: Record<string, number> = { coarse: 4, moderate: 10, fine: 16 };

export const meshAdvisor: LocalTool = {
  def: {
    name: "bulc_mesh_advisor",
    title: "Mesh advisor",
    description:
      "Cell-size advice from the fire size: characteristic fire diameter D* = (Q / (ρ∞ cp T∞ √g))^(2/5) and the cell sizes for " +
      "D*/dx = 4 (coarse), 10 (moderate) and 16 (fine). With domain_xb it proposes IJK per axis rounded to counts made of 2, 3 and 5 " +
      "(friendly to the FFT pressure solver), the resulting cells and the total cell count. Works without the app. " +
      "화원 크기로 셀 크기와 IJK 를 제안합니다(MESH-002, MESH-003, MESH-010).",
    inputSchema: obj(
      {
        hrr_kw: { type: "number", description: "Peak heat release rate of the design fire in kW" },
        ambient_c: { type: "number", description: "Ambient temperature in °C (default 20)" },
        domain_xb: { type: "array", items: { type: "number" }, minItems: 6, maxItems: 6, description: "Domain [x1,x2,y1,y2,z1,z2] in m" },
        quality: { type: "string", enum: ["coarse", "moderate", "fine"], description: "Target resolution at the fire (default moderate)" },
        cell_size: { type: "number", description: "Use this cell size (m) instead of the quality target" },
      },
      ["hrr_kw"],
    ),
    annotations: { title: "Mesh advisor", ...readOnly },
  },
  async run(args) {
    const q = argNumber(args, "hrr_kw");
    if (q === undefined || q <= 0) return text("hrr_kw 는 양수(kW)여야 합니다 / hrr_kw must be a positive number in kW.", true);
    const t = argNumber(args, "ambient_c") ?? 20;
    const d = characteristicDiameter(q, t);
    const quality = argString(args, "quality") ?? "moderate";
    const ratio = QUALITY[quality] ?? 10;
    const lines = [
      `D* = ${d.toFixed(3)} m for ${q} kW at ${t} °C`,
      `cell size: D*/4 = ${(d / 4).toFixed(3)} m (coarse) · D*/10 = ${(d / 10).toFixed(3)} m (moderate) · D*/16 = ${(d / 16).toFixed(3)} m (fine)  (MESH-002)`,
    ];
    const xb = Array.isArray(args.domain_xb) ? (args.domain_xb as unknown[]).map(Number) : null;
    const target = argNumber(args, "cell_size") ?? d / ratio;
    if (xb && xb.length === 6 && xb.every(Number.isFinite)) {
      const L = [xb[1] - xb[0], xb[3] - xb[2], xb[5] - xb[4]];
      if (L.some((x) => x <= 0)) return text("domain_xb 는 [x1,x2,y1,y2,z1,z2] 이고 각 축 min < max 여야 합니다(GEN-003).", true);
      const ijk = L.map((len) => nearestFftFriendly(Math.max(1, len / target)));
      const cells = L.map((len, i) => len / ijk[i]);
      const aspect = Math.max(...cells) / Math.min(...cells);
      const total = ijk[0] * ijk[1] * ijk[2];
      lines.push(
        "",
        `target cell ${target.toFixed(3)} m (${argNumber(args, "cell_size") ? "given" : `${quality}, D*/dx = ${ratio}`}) on domain ${L.map((x) => x.toFixed(2)).join(" × ")} m:`,
        `  IJK = ${ijk.join(", ")}  (each a product of 2, 3, 5: ${ijk.every(isFftFriendly) ? "yes" : "no"})`,
        `  cells dx, dy, dz = ${cells.map((c) => c.toFixed(3)).join(", ")} m · aspect ratio ${aspect.toFixed(2)}${aspect > 2 ? " (> 2 — adjust the domain, MESH-003)" : ""}`,
        `  total cells = ${total.toLocaleString("en-US")}  · D*/dx = ${(d / Math.max(...cells)).toFixed(1)}`,
        `  set_mesh {"ni": ${ijk[0]}, "nj": ${ijk[1]}, "nk": ${ijk[2]}, "xb": [${xb.join(", ")}]}`,
      );
      if (total > 5_000_000)
        lines.push(
          "  ⚠ more than 5 million cells: check GPU memory and run time (MESH-007); consider auto_multimesh with the fine cell only around the fire.",
        );
    }
    lines.push(
      "",
      "notes: the cell size near the fire controls the plume resolution; a multi-mesh layout can keep fine cells there and coarser cells elsewhere (auto_multimesh). " +
        "Report D*/dx with the results (MESH-002).",
    );
    return text(lines.join("\n"));
  },
};
