// Tool catalog — what this server advertises in tools/list.
//
// The running BULC app is the source of truth (bridge GET /tools). MCP clients ask for the list as
// soon as they connect, usually before the user has started BULC, and a client that sees an empty
// list concludes the feature does not exist. So a snapshot of the app's tool definitions (names,
// descriptions, input schemas — no implementation) ships with this package and is used whenever
// the app cannot be reached. Once BULC is running, the live list wins.
import fs from "node:fs";
import path from "node:path";
import { annotationsFor, sideEffectNote, type ToolAnnotations } from "./annotations.js";
import type { BridgeClient, BridgeTool, Probe } from "./bridge.js";
import { DESCRIPTION_SOFT_LIMIT, type Config } from "./config.js";
import type { Knowledge } from "./knowledge/store.js";
import { BUILD_DIR } from "./paths.js";

export interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  category?: string;
}

export interface Snapshot {
  schemaVersion?: number;
  appVersion?: string;
  generatedAt?: string;
  toolCount: number;
  sha256?: string;
  /** First 16 hex digits of sha256 — the same value the app reports as /health toolsHash for this tool set. */
  toolsHash?: string;
  tools: BridgeTool[];
}

export function loadSnapshot(): Snapshot {
  const file = path.join(BUILD_DIR, "tools-snapshot.json");
  const s = JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
  if (!s.toolsHash && s.sha256) s.toolsHash = s.sha256.slice(0, 16);
  return s;
}

export interface AppToolList {
  tools: BridgeTool[];
  live: boolean;
  probe: Probe;
}

const LIVE_TTL_MS = 5000;

export class Catalog {
  readonly snapshot: Snapshot;
  private readonly snapshotByName: Map<string, BridgeTool>;
  private liveCache: { at: number; tools: BridgeTool[]; probe: Probe } | null = null;
  lastProbe: Probe | null = null;

  constructor(
    private readonly cfg: Config,
    private readonly bridge: BridgeClient,
    private readonly knowledge: Knowledge,
    private readonly localTools: () => ToolDef[],
    snapshot?: Snapshot,
  ) {
    this.snapshot = snapshot ?? loadSnapshot();
    this.snapshotByName = new Map(this.snapshot.tools.map((t) => [t.name, t]));
  }

  invalidate(): void {
    this.liveCache = null;
  }

  /** Definitions of the tools implemented by this server. */
  localDefs(): ToolDef[] {
    return this.localTools();
  }

  /** App tools: live when the app answers as BULC, otherwise the bundled snapshot. */
  async appTools(): Promise<AppToolList> {
    if (this.liveCache && Date.now() - this.liveCache.at < LIVE_TTL_MS) {
      return { tools: this.liveCache.tools, live: true, probe: this.liveCache.probe };
    }
    const probe = await this.bridge.probe();
    this.lastProbe = probe;
    if (probe.state === "connected") {
      try {
        const tools = await this.bridge.fetchTools();
        if (tools.length > 0) {
          this.liveCache = { at: Date.now(), tools, probe };
          return { tools, live: true, probe };
        }
      } catch {
        /* fall back to the snapshot */
      }
    }
    return { tools: this.snapshot.tools, live: false, probe };
  }

  categoryOf(t: BridgeTool): string | undefined {
    return t.category ?? this.snapshotByName.get(t.name)?.category;
  }

  /** Look up an app tool definition (live list if fresh, else snapshot). */
  async findAppTool(name: string): Promise<BridgeTool | undefined> {
    const { tools } = await this.appTools();
    return tools.find((t) => t.name === name) ?? this.snapshotByName.get(name);
  }

  decorate(t: BridgeTool): ToolDef {
    let description = t.description;
    // Notes and rule hints are added only while the description stays within DESCRIPTION_SOFT_LIMIT, so this server
    // never pushes an app description over the 1,024-character cap some clients enforce (an app description that is
    // already longer is left as the app wrote it; BULC_MCP_MAX_DESCRIPTION truncates if a client needs it).
    const fits = (extra: string) => description.length + extra.length <= DESCRIPTION_SOFT_LIMIT;
    const note = sideEffectNote(t.name);
    if (note && fits(`\n${note}`)) description += `\n${note}`;
    if (t.liveOnly) {
      const live = "\n[bulc-mcp] Live app only.";
      if (!/live app only/i.test(description) && fits(live)) description += live;
    }
    if (this.cfg.hints) {
      const rules = this.knowledge.rulesForTool(t.name).slice(0, 3);
      const hint = `\n[bulc-mcp rules] ${rules.map((r) => r.id).join(", ")} — bulc_knowledge_search "<id>"`;
      if (rules.length && fits(hint)) description += hint;
    }
    if (this.cfg.maxDescription && description.length > this.cfg.maxDescription) {
      description = `${description.slice(0, this.cfg.maxDescription - 1)}…`;
    }
    const annotations = annotationsFor(t.name, t.annotations);
    return { name: t.name, title: annotations.title, description, inputSchema: t.inputSchema, annotations, category: this.categoryOf(t) };
  }

  /** The full tools/list answer. */
  async list(): Promise<{ tools: ToolDef[]; live: boolean; probe: Probe; appToolCount: number }> {
    const { tools, live, probe } = await this.appTools();
    const local = this.localTools().filter((t) => !this.cfg.hideTools.has(t.name));
    const localNames = new Set(local.map((t) => t.name));
    let app: ToolDef[] = [];
    if (this.cfg.profile === "full") {
      app = tools
        .filter((t) => !localNames.has(t.name) && !this.cfg.hideTools.has(t.name))
        .filter((t) => !this.cfg.toolsets || this.cfg.toolsets.has(this.categoryOf(t) ?? ""))
        .map((t) => this.decorate(t));
    }
    return { tools: [...local, ...app], live, probe, appToolCount: tools.length };
  }
}
