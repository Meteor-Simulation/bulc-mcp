// Minimal FDS namelist reader — enough for deterministic deck checks, not a full Fortran parser.
//
//   &GROUP KEY=value, KEY2='text', XB=0,1,0,1,0,1, FLAG=.TRUE. /
//
// Text outside &…/ records is ignored (FDS treats it as comments). Strings may use ' or ".
// Repeat counts (3*0.0) are expanded. Indexed keys (MASS_FRACTION(1)=…) keep the base name and
// remember the index text.

export type Value = string | number | boolean;

export interface Entry {
  key: string; // upper-case base name
  index?: string; // text inside (...) if the key was indexed
  values: Value[];
}

export interface NamelistRecord {
  group: string; // upper-case group name without &
  line: number; // 1-based line of the &GROUP token
  entries: Entry[];
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?$/;

function convert(word: string): Value {
  const w = word.trim();
  if (NUMBER.test(w)) return Number(w.replace(/[dD]/, "e"));
  const u = w.toUpperCase();
  if (u === ".TRUE." || u === "T" || u === ".T." || u === "TRUE") return true;
  if (u === ".FALSE." || u === "F" || u === ".F." || u === "FALSE") return false;
  return w;
}

type Tok = { t: "str"; v: string } | { t: "word"; v: string } | { t: "comma" } | { t: "eq" };

function tokenizeBody(body: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = "";
      while (j < body.length) {
        if (body[j] === c) {
          if (body[j + 1] === c) {
            s += c;
            j += 2;
            continue;
          }
          break;
        }
        s += body[j++];
      }
      toks.push({ t: "str", v: s });
      i = j + 1;
    } else if (c === ",") {
      toks.push({ t: "comma" });
      i++;
    } else if (c === "=") {
      toks.push({ t: "eq" });
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      let j = i;
      let depth = 0;
      while (j < body.length) {
        const d = body[j];
        if (d === "(") depth++;
        else if (d === ")") depth = Math.max(0, depth - 1);
        else if (depth === 0 && (/\s/.test(d) || d === "," || d === "=" || d === "'" || d === '"')) break;
        else if (depth > 0 && (d === "'" || d === '"')) break;
        j++;
      }
      toks.push({ t: "word", v: body.slice(i, j) });
      i = j;
    }
  }
  return toks;
}

function parseEntries(body: string): Entry[] {
  const toks = tokenizeBody(body);
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k];
    const next = toks[k + 1];
    if (tok.t === "word" && next?.t === "eq") {
      const m = tok.v.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/);
      cur = { key: (m?.[1] ?? tok.v).toUpperCase(), index: m?.[2], values: [] };
      entries.push(cur);
      k++; // skip '='
      continue;
    }
    if (!cur) continue;
    if (tok.t === "str") cur.values.push(tok.v);
    else if (tok.t === "word") {
      const rep = tok.v.match(/^(\d+)\*(.+)$/);
      if (rep) for (let r = 0; r < Number(rep[1]); r++) cur.values.push(convert(rep[2]));
      else cur.values.push(convert(tok.v));
    }
  }
  return entries;
}

/** Parse every &GROUP … / record in a deck. */
export function parseNamelists(text: string): NamelistRecord[] {
  const records: NamelistRecord[] = [];
  let i = 0;
  let line = 1;
  let lineStart = true; // only blanks seen since the last newline
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "\n") {
      line++;
      i++;
      lineStart = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    // FDS records start with '&' as the first non-blank character of a line; an '&' elsewhere
    // (e.g. "R&D" in a comment) is just text.
    if (c === "&" && lineStart && /[A-Za-z]/.test(text[i + 1] ?? "")) {
      lineStart = false;
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
      const group = text.slice(i + 1, j).toUpperCase();
      const startLine = line;
      // find the terminating '/' outside quotes
      let k = j;
      let quote: string | null = null;
      while (k < n) {
        const d = text[k];
        if (d === "\n") line++;
        if (quote) {
          if (d === quote) quote = null;
        } else if (d === "'" || d === '"') quote = d;
        else if (d === "/") break;
        k++;
      }
      records.push({ group, line: startLine, entries: parseEntries(text.slice(j, k)) });
      i = k + 1;
      continue;
    }
    lineStart = false;
    i++;
  }
  return records;
}

// ── accessors ────────────────────────────────────────────────────────────────

export function get(rec: NamelistRecord, key: string): Value[] | undefined {
  const k = key.toUpperCase();
  const e = rec.entries.find((x) => x.key === k && x.index === undefined) ?? rec.entries.find((x) => x.key === k);
  return e?.values;
}

export function str(rec: NamelistRecord, key: string): string | undefined {
  const v = get(rec, key)?.[0];
  return v === undefined ? undefined : String(v);
}

export function num(rec: NamelistRecord, key: string): number | undefined {
  const v = get(rec, key)?.[0];
  return typeof v === "number" ? v : undefined;
}

export function nums(rec: NamelistRecord, key: string): number[] | undefined {
  const v = get(rec, key);
  if (!v) return undefined;
  const out = v.filter((x): x is number => typeof x === "number");
  return out.length === v.length ? out : undefined;
}

export function strs(rec: NamelistRecord, key: string): string[] | undefined {
  return get(rec, key)?.map((v) => String(v));
}

export function has(rec: NamelistRecord, key: string): boolean {
  return rec.entries.some((x) => x.key === key.toUpperCase());
}

export function idOf(rec: NamelistRecord): string | undefined {
  return str(rec, "ID");
}
