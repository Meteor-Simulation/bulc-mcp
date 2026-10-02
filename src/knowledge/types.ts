// Shapes of build/knowledge.json (written by scripts/build-knowledge.mjs).

export type Severity = "error" | "warning" | "info";

export interface Rule {
  id: string;
  domain: string;
  severity: Severity;
  confidence: string;
  applies_to: string[];
  title: string;
  title_en: string;
  condition: string;
  check?: { tools?: string[]; how?: string };
  fix?: { tools?: string[]; how?: string };
}

export interface Mistake {
  id: string;
  mistake: string;
  consequence: string;
  correct: string;
  rules: string[];
}

export interface OntClass {
  label?: { en?: string; ko?: string };
  description?: string;
  parent?: string;
  fds?: string[];
  properties?: Record<string, unknown>;
  relations?: Record<string, string | string[]>;
  tools?: Record<string, string[]>;
  rules?: string[];
  [k: string]: unknown;
}

export interface Playbook {
  id: string;
  slug: string;
  file: string;
  title: string;
  summary: string;
  rules: string[];
  tools: string[];
  sections: { heading: string; text: string }[];
}

export interface GlossaryRow {
  section: string;
  header: string[];
  cells: string[];
  text: string;
}

export interface FdsKey {
  type?: string;
  unit?: string;
  default?: unknown;
  values?: unknown[];
  en?: string;
  ko?: string;
  mistakes?: string[];
  rules?: string[];
}

export interface FdsGroup {
  title?: { en?: string; ko?: string };
  tools?: string[];
  keys: Record<string, FdsKey>;
}

export interface FdsError {
  code: number;
  en: string;
  ko: string;
  rules?: string[];
}

export interface PromptArg {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptDef {
  name: string;
  title: { ko: string; en: string };
  description: string;
  arguments: PromptArg[];
  playbook: string | null;
  rules: string[];
  template: string;
}

export interface ResourceFile {
  uri: string;
  path: string;
  name: string;
  title: string;
  description?: string;
  mimeType: string;
}

export interface KnowledgeBundle {
  version: string;
  builtAt: string;
  fdsVersion: string;
  rules: Rule[];
  mistakes: Mistake[];
  ontology: {
    meta: Record<string, unknown>;
    conventions: Record<string, unknown>;
    areas: Record<string, string[]>;
    classes: Record<string, OntClass>;
    triples: [string, string, string][];
  };
  playbooks: Playbook[];
  glossary: GlossaryRow[];
  fds: { syntax: Record<string, string>; groups: Record<string, FdsGroup>; errors: FdsError[] };
  prompts: PromptDef[];
  files: ResourceFile[];
  toolRules: Record<string, string[]>;
}
