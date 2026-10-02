import type { ToolDef } from "../catalog.js";
import type { Profile } from "../config.js";
import { checkDeck } from "./check-deck.js";
import { callTool, findTools } from "./compact.js";
import { connectionStatus } from "./connection.js";
import { drawingIntake } from "./drawing-intake.js";
import { getRules, knowledgeSearch } from "./knowledge-tools.js";
import { meshAdvisor } from "./mesh-advisor.js";
import { planCheck } from "./plan-check.js";
import { projectSummary, runSimulation } from "./project.js";
import type { LocalTool } from "./types.js";

export const LOCAL_TOOLS: LocalTool[] = [
  connectionStatus,
  knowledgeSearch,
  getRules,
  planCheck,
  drawingIntake,
  checkDeck,
  meshAdvisor,
  findTools,
  callTool,
  projectSummary,
  runSimulation,
];

export function localToolsFor(profile: Profile): LocalTool[] {
  return LOCAL_TOOLS.filter((t) => !t.profiles || t.profiles.includes(profile));
}

export function localDefs(profile: Profile): ToolDef[] {
  return localToolsFor(profile).map((t) => t.def);
}

export type { LocalTool };
