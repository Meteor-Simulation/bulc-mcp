// Generic "must not be published" patterns. Deliberately generic: no customer or person names
// live in this public repository (a list of names would itself disclose them). Name-based
// screening happens before a snapshot is exported from the private app repository.

export const PATTERNS = [
  { id: "windows-user-path", re: /\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/gi, why: "absolute Windows user-profile path" },
  { id: "posix-home-path", re: /(?:^|[\s"'`(])\/(?:Users|home)\/[a-z0-9._-]+\//gim, why: "absolute home-directory path" },
  { id: "appdata-path", re: /AppData[\\/]+(?:Local|Roaming)[\\/]+/gi, why: "application-data path" },
  { id: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, why: "e-mail address", allow: [/@example\.(?:com|org|net)$/i, /^git@github\.com$/i, /^noreply@/i] },
  { id: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{10,}/g, why: "API key" },
  { id: "openai-style-key", re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g, why: "API key" },
  { id: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g, why: "GitHub token" },
  { id: "npm-token", re: /\bnpm_[A-Za-z0-9]{30,}/g, why: "npm token" },
  { id: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/g, why: "AWS access key" },
  { id: "google-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, why: "Google API key" },
  { id: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, why: "Slack token" },
  { id: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, why: "private key" },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g, why: "JSON web token" },
  { id: "kr-mobile", re: /(?<![\d.])01[016789][-\s]?\d{3,4}[-\s]?\d{4}(?![\d.])/g, why: "phone number" },
  { id: "kr-rrn", re: /(?<!\d)\d{6}-[1-4]\d{6}(?!\d)/g, why: "resident registration number" },
  { id: "engine-source-ref", re: /\b[\w-]+\.(?:rs|cu|cuh|ptx)\b/g, why: "reference to an engine/kernel source file" },
];

/** Scan one text; returns [{id, why, match, line}] */
export function scanText(text) {
  const hits = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      const match = m[0].trim();
      if (p.allow?.some((a) => a.test(match))) continue;
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ id: p.id, why: p.why, match: match.length > 80 ? `${match.slice(0, 77)}...` : match, line });
    }
  }
  return hits;
}
