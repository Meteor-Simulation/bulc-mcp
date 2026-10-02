// Dependency-free BM25 search over the knowledge pack (Korean + English).
//
// Tokens: lower-cased letter/digit runs; snake_case identifiers also yield their parts; Hangul runs
// also yield character bigrams so that "스프링클러를" still matches "스프링클러".

export interface SearchDoc {
  id: string;
  kind: string;
  title: string;
  text: string;
  uri: string;
  domain?: string;
  extra?: Record<string, unknown>;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.match(/[\p{L}\p{N}_]+/gu) ?? []) {
    const raw = word.toLowerCase();
    out.push(raw);
    // camelCase identifiers (floorIndex, kFactor) also yield their parts
    if (/[a-z][A-Z]/.test(word)) for (const part of word.split(/(?<=[a-z0-9])(?=[A-Z])/)) if (part.length > 1) out.push(part.toLowerCase());
    if (raw.includes("_")) for (const part of raw.split("_")) if (part.length > 1) out.push(part);
    if (HANGUL.test(raw) && raw.length > 2) {
      for (let i = 0; i + 2 <= raw.length; i++) out.push(raw.slice(i, i + 2));
    }
  }
  return out;
}

export class SearchIndex {
  private docs: SearchDoc[] = [];
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(docs: SearchDoc[]) {
    for (const d of docs) this.add(d);
    this.avgLen = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
  }

  private add(doc: SearchDoc): void {
    // the title and id count three times — they are the most specific words of a document
    const tokens = [...tokenize(`${doc.id} ${doc.title}`), ...tokenize(`${doc.id} ${doc.title}`), ...tokenize(`${doc.id} ${doc.title}`), ...tokenize(doc.text)];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.docs.push(doc);
    this.tf.push(tf);
    this.len.push(tokens.length);
  }

  get size(): number {
    return this.docs.length;
  }

  all(): SearchDoc[] {
    return this.docs;
  }

  search(query: string, opts: { kinds?: string[]; domain?: string; limit?: number } = {}): SearchHit[] {
    const q = [...new Set(tokenize(query))];
    const n = this.docs.length;
    const k1 = 1.2;
    const b = 0.75;
    const exactIds = new Set((query.toUpperCase().match(/\b[A-Z]{2,5}-\d{3}\b/g) ?? []).map((s) => s.toUpperCase()));
    const hits: SearchHit[] = [];
    for (let i = 0; i < n; i++) {
      const doc = this.docs[i];
      if (opts.kinds?.length && !opts.kinds.includes(doc.kind)) continue;
      if (opts.domain && doc.domain && doc.domain !== opts.domain) continue;
      if (opts.domain && !doc.domain && doc.kind === "rule") continue;
      let score = 0;
      const tf = this.tf[i];
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.len[i]) / this.avgLen)));
      }
      if (doc.kind === "rule") score *= 1.2; // rules are the primary guidance
      if (exactIds.has(doc.id.toUpperCase())) score += 100;
      if (doc.id.toLowerCase() === query.trim().toLowerCase()) score += 50;
      if (score > 0) hits.push({ doc, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, opts.limit ?? 8);
  }
}
