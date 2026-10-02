# 개인정보 처리 방침 / Privacy Policy

**BULC MCP** (`@meteor-simulation/bulc-mcp`, Claude Desktop extension "BULC Building Designer")

최종 수정 / Last updated: 2026-10-02

---

## 한국어

### 요약

| 항목 | 내용 |
|---|---|
| 수집하는 정보 | 없음 |
| 서버의 통신 상대 | 이 PC 의 BULC 데스크톱 앱(`127.0.0.1` 브리지)만 |
| 텔레메트리·분석 | 없음 |
| 계정·API 키 | 필요 없음, 저장하지 않음 |
| 파일 업로드 | 없음 |

### 서버가 하는 일

- 이 서버는 사용자 PC 에서 MCP 클라이언트(Claude Desktop 등)의 자식 프로세스로 실행됩니다.
- 서버는 같은 PC 에서 실행 중인 BULC 앱이 `127.0.0.1` 에 여는 HTTP 브리지에만 연결합니다. 루프백이 아닌 주소에는 연결하지 않습니다
  (`BULC_MCP_ALLOW_REMOTE=1` 로 사용자가 명시적으로 허용한 경우는 예외).
- 서버가 직접 읽는 파일은 사용자가 경로를 지정한 도면·FDS 덱, 앱이 만든 스크린샷 PNG, 그리고 앱의 발견 파일(사용자 설정 폴더의 `BULC/bridge.json` — 브리지 주소와 토큰)뿐입니다. 이 파일을 다른 곳으로 보내지 않으며, 브리지 토큰은 그 앱의 `127.0.0.1` 주소에만 보냅니다.
- 앱의 열기·저장·캡처 도구가 쓰는 파일 경로는 AI 가 도구 인자로 정하고, 앱이 경로 정책(절대 경로·확장자·시스템 폴더 거절, 덮어쓰기 확인)으로 검사합니다.
- 프로젝트 데이터는 BULC 앱이 사용자 PC 에 저장합니다. 이 서버는 따로 저장하지 않습니다.

### AI 공급자에게 전달되는 정보 (중요)

MCP 클라이언트는 도구 호출 결과를 대화의 일부로 사용자가 고른 AI 공급자(예: Anthropic, OpenAI, 로컬 모델)에게 보냅니다.
도면 분류 결과, 앱의 도면 인식 요약(벽·문·창 좌표, 실명·층 표기), 덱 점검 결과, 프로젝트 요약, 해석 결과 요약, 화면 캡처(`capture_view`) 같은 **도구 결과는 그 공급자의 정책에 따라 처리됩니다.**

- 이 서버의 도면 분류 도구는 도면 안의 문자(도곽·회사명·도면 번호 등)를 결과에 넣지 않지만, 레이어 이름과 좌표는 넣습니다. 앱의 도면 인식 도구는 실명·층 표기 같은 짧은 문자를 돌려줄 수 있습니다.
- 보안이 엄격한 도면은 로컬 모델을 쓰는 MCP 클라이언트를 쓰거나, 공유할 수 있는 형태로 정리한 뒤 사용하십시오.

### `rewrite_fds_via_ai` 도구 (구버전 앱)

BULC 0.88 이하 앱에서는 `rewrite_fds_via_ai` 도구가 목록에 보일 수 있습니다. 이 도구는 현재 프로젝트의 FDS 덱 전체를 **BULC 앱에 설정된 AI 공급자**로 보내 편집을 요청합니다.
이 서버는 이 도구에 외부 전송 표시(`openWorldHint`)와 안내 문구를 붙입니다. 쓰지 않으려면 `BULC_MCP_HIDE_TOOLS=rewrite_fds_via_ai` 로 숨기십시오. 0.89 부터는 앱 안 어시스턴트 전용이라 MCP 에 노출되지 않습니다.

### 문의

GitHub 이슈(공개) 또는 GitHub 의 비공개 취약점 신고(보안 문제)를 이용해 주십시오: <https://github.com/Meteor-Simulation/bulc-mcp>.
이슈에 고객 도면·프로젝트 파일·개인정보를 첨부하지 마십시오.

---

## English

### Summary

| Item | Practice |
|---|---|
| Data collected by us | None |
| Who the server talks to | Only the BULC desktop app on this PC (`127.0.0.1` bridge) |
| Telemetry / analytics | None |
| Accounts / API keys | Not needed, not stored |
| File uploads | None |

### What the server does

- It runs on your computer as a child process of your MCP client.
- It connects only to the HTTP bridge that the BULC app opens on `127.0.0.1`, and refuses non-loopback addresses unless you set
  `BULC_MCP_ALLOW_REMOTE=1`.
- The only files it reads are drawings and FDS decks whose paths you give it, screenshot PNGs produced by the app, and the app's
  discovery file (`BULC/bridge.json` in your user config folder — bridge address and token). It does not send them anywhere; the
  bridge token is sent only to that app's `127.0.0.1` address.
- File paths used by the app's open / save / capture tools are chosen by the AI as tool arguments and checked by the app's path
  policy (absolute paths only, extension checks, system folders refused, overwrite confirmation).
- Project data is stored by the BULC app on your computer; this server stores nothing.

### What reaches your AI provider (important)

Your MCP client sends tool results to the AI provider you chose (for example Anthropic, OpenAI or a local model) as part of the
conversation. Drawing classifications, the app's drawing-recognition summaries (wall, door and window coordinates, room and level
labels), deck findings, project and result summaries and screenshots (`capture_view`) are therefore **handled under that provider's
policy**. This server's drawing-intake tool never returns text found inside a drawing (title blocks, company names, drawing
numbers), but it does return layer names and coordinates; the app's recognition tools may return short labels such as room names.
For confidential drawings, consider an MCP client that uses a local model.

### The `rewrite_fds_via_ai` tool (older apps)

BULC 0.88 and older may list `rewrite_fds_via_ai`, which sends the whole FDS deck of the current project to **the AI provider
configured in the BULC app**. This server marks it as an external-transfer tool (`openWorldHint`) and says so in its description.
Hide it with `BULC_MCP_HIDE_TOOLS=rewrite_fds_via_ai`. From 0.89 it is reserved for the in-app assistant and not exposed over MCP.

### Contact

Use GitHub issues (public) or GitHub private vulnerability reporting (security) at
<https://github.com/Meteor-Simulation/bulc-mcp>. Do not attach customer drawings, project files or personal data to issues.

### Changes

Changes to this policy are published in this repository with a new "Last updated" date.

Meteor Simulation Inc.
