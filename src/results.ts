// App reply → MCP tool result.
//
// The app answers tool-level failures with HTTP 200 and a message such as "Tool input error (…)" or
// "Unknown tool: …". Those are marked isError so the client model does not treat them as success,
// and a short pointer to the relevant rule is appended. A structured `data` object becomes MCP
// structuredContent and an `image` (capture_view, shape_screenshot) becomes image content.
import fs from "node:fs";
import path from "node:path";
import type { AppReply } from "./bridge.js";

export interface TextContent {
  type: "text";
  text: string;
}
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
export type Content = TextContent | ImageContent;

export interface ToolResult {
  content: Content[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  [k: string]: unknown;
}

export const text = (body: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: body }],
  ...(isError ? { isError: true } : {}),
});

export const json = (data: unknown, isError = false): ToolResult => text(JSON.stringify(data, null, 2), isError);

interface ErrorPattern {
  re: RegExp;
  hint: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    re: /^Tool input error\b/,
    hint:
      "[bulc-mcp] 인자가 도구 스키마와 맞지 않습니다. tools/list 의 inputSchema 와 위 문구가 제안하는 인자 이름을 따라 다시 호출하세요(GEN-005).\n" +
      "[bulc-mcp] The arguments do not match the tool schema. Re-read inputSchema, apply the suggestion above and call again (GEN-005).",
  },
  {
    re: /^Unknown tool\b/,
    hint:
      "[bulc-mcp] 연결된 앱에 이 도구가 없습니다. bulc_find_tools 나 tools/list 로 실제 도구를 찾으세요(GEN-005). 파일 도구는 project_open / project_save / project_export_fds, " +
      "실행은 sim_preflight → sim_start 입니다(GEN-014, GEN-016). 앱이 오래된 버전이라 없으면 사용자에게 앱 화면에서 할 일을 안내하세요.\n" +
      "[bulc-mcp] The connected app has no such tool. Find the real one with bulc_find_tools / tools/list (GEN-005). File tools are " +
      "project_open / project_save / project_export_fds and runs go through sim_preflight → sim_start (GEN-014, GEN-016); on an older app " +
      "without them, tell the user what to do in the app.",
  },
  { re: /^Tool error \(/, hint: "[bulc-mcp] 앱에서 도구 실행이 실패했습니다. 입력을 확인하고 bulc_knowledge_search 로 관련 규칙을 찾으세요.\n[bulc-mcp] The tool failed inside the app; check the inputs and search the rules." },
  { re: /^\.fds 생성 실패/, hint: "[bulc-mcp] 덱을 만들지 못했습니다. validate_project 로 깨진 항목을 확인하세요(GEN-006).\n[bulc-mcp] The deck could not be generated; run validate_project (GEN-006)." },
  { re: /^스크린샷 실패/, hint: "[bulc-mcp] Screenshot failed — the BULC window must be visible on screen." },
];

export function classifyMessage(message: string): ErrorPattern | null {
  const m = message.trimStart();
  return ERROR_PATTERNS.find((p) => p.re.test(m)) ?? null;
}

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** PNG paths mentioned in a screenshot reply. */
export function pngPaths(message: string): string[] {
  const out: string[] = [];
  // paths may contain spaces (user-profile temp folders); stop at the first ".png"
  for (const m of message.matchAll(/((?:[A-Za-z]:[\\/]|\/)[^"'<>|*?\r\n]*?\.png)(?![A-Za-z0-9])/gi)) out.push(m[1]);
  return out;
}

/** Larger structured results are dropped (the text part still carries the readable summary). */
export const MAX_STRUCTURED_CHARS = 200_000;

/** MCP structuredContent must be a JSON object; wrap anything else. */
export function toStructured(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined || data === null) return undefined;
  let size = 0;
  try {
    size = JSON.stringify(data).length;
  } catch {
    return undefined;
  }
  if (size > MAX_STRUCTURED_CHARS) return undefined;
  if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  return { value: data };
}

export function fromAppReply(name: string, reply: AppReply, opts: { attachImages: boolean }): ToolResult {
  const message = reply.message ?? "";
  const action = reply.action ? `\n[action] ${reply.action.type ?? ""}: ${reply.action.summary ?? ""}` : "";
  const err = classifyMessage(message);
  let body = `${message}${action}`;
  if (err) body += `\n\n${err.hint}`;
  if (!err && name === "validate_project" && /^점검 실패/.test(message.trimStart())) {
    body +=
      "\n\n[bulc-mcp] [오류] 를 0 건으로 만들기 전에는 실행하지 마세요. sim_start 와 run_simulation 도 이 상태에서는 실행을 거절합니다(GEN-006, GEN-016).\n" +
      "[bulc-mcp] Fix every [오류] (error) before running; sim_start and run_simulation refuse to start in this state (GEN-006, GEN-016).";
  }
  const result: ToolResult = { content: [{ type: "text", text: body }], ...(err ? { isError: true } : {}) };
  const structured = err ? undefined : toStructured(reply.data);
  if (structured) result.structuredContent = structured;

  if (opts.attachImages && !err) {
    const img = reply.image;
    if (img?.base64) {
      // newer apps send the picture itself (capture_view, shape_screenshot)
      const mimeType = img.mimeType && IMAGE_TYPES.has(img.mimeType) ? img.mimeType : "image/png";
      const bytes = Math.floor((img.base64.length * 3) / 4);
      if (bytes <= MAX_IMAGE_BYTES) result.content.push({ type: "image", data: img.base64, mimeType });
      else result.content.push({ type: "text", text: `[bulc-mcp] image not attached: ${(bytes / 1048576).toFixed(1)} MB > ${MAX_IMAGE_BYTES / 1048576} MB (use maxWidth or savePath).` });
    } else if (name === "shape_screenshot") {
      // older apps only print the PNG path
      for (const p of pngPaths(message).slice(0, 1)) {
        try {
          const abs = path.resolve(p);
          const st = fs.statSync(abs);
          if (st.isFile() && st.size > 0 && st.size <= MAX_IMAGE_BYTES) {
            result.content.push({ type: "image", data: fs.readFileSync(abs).toString("base64"), mimeType: "image/png" });
          }
        } catch {
          /* path not readable — the text still tells the model where the file is */
        }
      }
    }
  }
  return result;
}
