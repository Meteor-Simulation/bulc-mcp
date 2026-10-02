// Header-level readers for drawing files other than DXF. Local reads only.

export interface PdfInfo {
  version?: string;
  pages: number;
  hasFonts: boolean;
  encrypted: boolean;
}

export function sniffPdf(buf: Buffer): PdfInfo | null {
  const head = buf.subarray(0, 16).toString("latin1");
  const m = head.match(/^%PDF-(\d\.\d)/);
  if (!m) return null;
  const s = buf.toString("latin1");
  const pages = (s.match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length;
  return { version: m[1], pages, hasFonts: /\/Font\b/.test(s), encrypted: /\/Encrypt\b/.test(s) };
}

export interface ZipEntry {
  name: string;
  size: number;
}

/** Entry names from the ZIP central directory (no decompression). */
export function sniffZip(buf: Buffer): ZipEntry[] | null {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return null;
  // end of central directory record: search the last 64 KiB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let k = 0; k < count && off + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(off + 8);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const raw = buf.subarray(off + 46, off + 46 + nameLen);
    const name = flags & 0x800 ? raw.toString("utf8") : raw.toString("latin1");
    out.push({ name, size });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function sniffImage(buf: Buffer): { format: string; width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { format: "jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { format: "jpeg", width: 0, height: 0 };
  }
  return null;
}

const DWG_RELEASES: Record<string, string> = {
  AC1009: "R11/R12",
  AC1012: "R13",
  AC1014: "R14",
  AC1015: "2000",
  AC1018: "2004",
  AC1021: "2007",
  AC1024: "2010",
  AC1027: "2013",
  AC1032: "2018",
};

export function sniffDwg(buf: Buffer): { version: string; release: string } | null {
  const v = buf.subarray(0, 6).toString("latin1");
  if (!/^AC\d{4}$/.test(v)) return null;
  return { version: v, release: DWG_RELEASES[v] ?? "unknown" };
}

export function sniffIfc(text: string): { schema?: string; counts: Record<string, number> } | null {
  if (!/^ISO-10303-21;/.test(text.trimStart())) return null;
  const schema = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1];
  const counts: Record<string, number> = {};
  for (const ent of ["IFCBUILDINGSTOREY", "IFCWALL", "IFCWALLSTANDARDCASE", "IFCDOOR", "IFCWINDOW", "IFCSLAB", "IFCSTAIR", "IFCSPACE", "IFCDUCTSEGMENT", "IFCPIPESEGMENT", "IFCFIRESUPPRESSIONTERMINAL"]) {
    const n = (text.match(new RegExp(`=\\s*${ent}\\s*\\(`, "g")) ?? []).length;
    if (n) counts[ent] = n;
  }
  return { schema, counts };
}
