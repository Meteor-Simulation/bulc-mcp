# BULC MCP

<p align="center">
  <img src="icon.png" alt="BULC" width="160"/>
</p>

<p align="center">
  <strong>BULC 데스크톱 앱을 AI 로 조작하는 MCP 서버 — 화재·연기 해석, 피난, HVAC 제연, 스프링클러·물분무 수리계산</strong><br/>
  <strong>An MCP server that lets AI assistants drive the BULC desktop app — fire &amp; smoke CFD, evacuation, HVAC smoke control, sprinkler &amp; water-spray hydraulics</strong>
</p>

<p align="center">
  <a href="#한국어">한국어</a> · <a href="#english">English</a>
</p>

---

## 한국어

### 무엇인가

BULC MCP 는 [Model Context Protocol](https://modelcontextprotocol.io) 서버입니다. Claude Desktop, Claude Code, Cursor, VS Code 같은 MCP 클라이언트의 AI 가
**이 PC 에서 실행 중인 BULC 데스크톱 앱**(FDS 6.10.1 기반 GPU 화재 시뮬레이터, 2D/3D 건물 편집기)을 자연어로 조작하게 합니다.

- **앱의 모든 기능**: 프로젝트 열기·저장, 도면 인식, 형상·Shape Studio, 격자, 해석 설정·사전 점검·실행·진행 확인, 출력, 화원, 재료, 감지기·제어, 스프링클러/물분무 배관망과 수리계산·펌프 사양·설계 검토, HVAC 덕트망, 피난 배치·실행·결과, 화재 결과 요약·ASET 판정, 결과 뷰어, 화면 캡처 — BULC 0.89 기준 **앱 도구 239종**을 그대로 노출합니다. 앱을 업데이트하면 새 도구가 이 서버를 다시 설치하지 않아도 따라옵니다.
- **도면 기반 작업**: 사용자가 PC 의 도면 파일(DWG, DXF, PDF, 이미지, ZIP 묶음, IFC) 경로를 알려 주면, 서버가 파일을 **로컬에서** 분류하고(`bulc_drawing_intake`) 맞는 작업 절차를 돌려줍니다. 건축 평면도는 앱이 벽·문·창·기둥·실명을 인식해 건물을 만들고(`arch_analyze_drawing` → `arch_import_building`), 스프링클러·물분무 배관 도면은 배관망을 만듭니다(`spr_analyze_drawing` → `spr_import_network`).
- **오류를 줄이는 지식 팩**: 온톨로지(클래스 79개), 규칙 166개(조건 → 확인 → 고치는 법), 흔한 LLM 실수 38개, 단계별 플레이북 6편, 한·영·FDS·도구 용어집, FDS 6.10.1 키 참조를 MCP resources·prompts·도구로 제공합니다. 실행 전 계획 점검(`bulc_plan_check`)과 덱 점검(`bulc_check_deck`)이 들어 있습니다.

이 저장소에는 BULC 앱이나 해석 엔진의 소스가 없습니다. 서버는 앱이 `127.0.0.1` 에서 여는 브리지에 요청을 전달하는 얇은 클라이언트입니다.

### 분야별로 할 수 있는 일

| 분야 | 대표 도구 | 흐름 |
|---|---|---|
| 프로젝트 | `project_info`, `project_open`, `project_save`, `project_export_fds`, `project_undo`, `fds_apply_text`, `capture_view` | 연 프로젝트 읽기 → 편집 → 저장(덮어쓰기는 확인 뒤) |
| 건축 도면 → 건물 | `arch_analyze_drawing`, `arch_import_building`, `arch_import_floorplan_report`, `add_wall`·`add_door`·`add_window` | 인식 → 질문 확인 → dryRun → 생성(되돌리기 1단계) |
| 화재·연기 해석 | `set_mesh`·`auto_multimesh`, `add_fire`, `set_all_boundaries_open`, `output_add_tenability_slices`, `sim_preflight`, `sim_start`, `sim_status` | 격자 → 화원(사용자 지시) → 경계 → 출력 → 점검 → 확인 → 실행 |
| 결과·ASET | `results_detect`, `fire_results_summary`, `fire_timeseries`, `fire_compute_aset`, `result_*` | 최대 HRR·감지 시각 → 출구별 ASET(1.8 m) |
| 피난·RSET | `evac_add_agents_batch`, `evac_add_stair`, `evac_add_journey`, `evac_run`, `evac_status`, `evac_get_results` | 배치 → 계단·경로 → 실행 → 출구별 통계·RSET |
| HVAC 제연 | `hvac_add_node`, `hvac_add_duct`, `hvac_add_exhaust_grille`, `hvac_run_calc`, `hvac_apply_to_fds` | 덕트망 → 풍량 계산 → FDS 반영 |
| 스프링클러·물분무 | `spr_analyze_drawing`, `spr_import_network`, `spr_auto_layout`, `spr_run_calc`, `spr_pump_sizing`, `spr_design_review`, `spr_apply_to_fds`, `spr_export_results` | 도면 인식·자동 배치 → 수리계산 → 펌프·검토 → FDS 작동 해석·계산서 |

앱 버전에 따라 도구 집합이 다릅니다. 0.88 이하 앱에는 `project_*`·`sim_*`·`fire_*`·`evac_run`·`arch_*`·`capture_view` 가 없고, 지식 팩의 규칙이 그때의 대안(앱 파일 메뉴, `run_simulation`, 수동 벽 입력)을 알려 줍니다.

### 동작 방식

```
MCP 클라이언트 ──stdio──▶ bulc-mcp (이 저장소)
 (Claude 등)               ├─ 로컬 도구: 연결 상태 · 지식 검색 · 규칙 · 계획 점검 · 도면 분류 · 덱 점검 · 격자 조언
                           ├─ resources: bulc://knowledge/… (온톨로지·규칙·플레이북·용어집·FDS 키)
                           ├─ prompts: 작업 절차 8종
                           └─ 앱 도구 ──HTTP 127.0.0.1──▶ BULC 데스크톱 앱 (2D/3D 편집기 · 도면 인식 · 덱 생성 · GPU/CPU 솔버)
```

- 앱이 켜져 있으면 앱의 도구 목록을 그대로 쓰고, 꺼져 있으면 내장 스냅샷(이름·설명·입력 스키마만)으로 목록을 채웁니다. 앱이 나중에 켜지거나 도구 집합이 바뀌면 `tools/list_changed` 알림을 보냅니다.
- 앱이 돌려준 그림(`capture_view`)은 이미지로, 구조화 결과(`sim_preflight`, `fire_compute_aset` 등)는 `structuredContent` 로 전달합니다.
- 앱이 HTTP 200 으로 돌려주는 오류 문구(`Tool input error`, `Unknown tool` 등)는 오류(`isError`)로 표시하고 관련 규칙을 덧붙입니다.
- 브리지 포트에서 BULC 가 아닌 프로그램이 응답하면 알아채고 알려 줍니다. 루프백(127.0.0.1) 밖의 주소에는 연결하지 않습니다.

### 요구 사항

1. **BULC 데스크톱 앱**(라이선스 필요), 실행 중이어야 합니다. 0.89 이상을 권합니다(0.88 은 줄어든 도구 집합으로 동작). 설치 파일: [Meteor-Simulation/bulc-releases](https://github.com/Meteor-Simulation/bulc-releases/releases/latest). 브리지는 기본으로 켜져 있습니다(앱 환경 변수 `BULC_BRIDGE=0` 이면 꺼짐).
2. **Node.js 20 이상**
3. MCP 클라이언트(Claude Desktop, Claude Code, Cursor, VS Code 등)

### 설치

**Claude Desktop** — 설정 파일(Windows `%APPDATA%\Claude\claude_desktop_config.json`, macOS `~/Library/Application Support/Claude/claude_desktop_config.json`)에 추가합니다.

```json
{
  "mcpServers": {
    "bulc": {
      "command": "npx",
      "args": ["-y", "@meteor-simulation/bulc-mcp"]
    }
  }
}
```

Windows 에서 `npx` 를 찾지 못하면 `"command": "cmd", "args": ["/c", "npx", "-y", "@meteor-simulation/bulc-mcp"]` 로 바꿉니다.

**Claude Code**

```bash
claude mcp add bulc --scope user -- npx -y @meteor-simulation/bulc-mcp
```

**Cursor** (`~/.cursor/mcp.json`) — 도구 수 상한이 있는 클라이언트는 `compact` 프로필을 권합니다.

```json
{ "mcpServers": { "bulc": { "command": "npx", "args": ["-y", "@meteor-simulation/bulc-mcp"], "env": { "BULC_MCP_PROFILE": "compact" } } } }
```

**VS Code** (`.vscode/mcp.json`)

```json
{ "servers": { "bulc": { "type": "stdio", "command": "npx", "args": ["-y", "@meteor-simulation/bulc-mcp"] } } }
```

**소스에서**

```bash
git clone https://github.com/Meteor-Simulation/bulc-mcp.git
cd bulc-mcp
npm install        # prepare 단계에서 빌드합니다
node build/server.js
```

클라이언트 설정의 `command` 는 `node`, `args` 는 `["<저장소 경로>/build/server.js"]` 로 둡니다.

### 앱 찾기(브리지 주소와 토큰)

설정 없이 동작합니다. BULC 앱(0.89 이상)은 브리지를 열 때 사용자 설정 폴더에 **발견 파일** `BULC/bridge.json`(Windows `%APPDATA%\BULC\bridge.json`)을 쓰고, 이 서버가 그 파일에서 주소·포트·토큰을 읽습니다. 앱이 8787 이 아닌 포트에서 돌아도(다른 프로그램이 8787 을 쓰는 경우) 그대로 찾습니다. 종료된 앱이 남긴 파일은 무시합니다.

- 순서: `BULC_BRIDGE_URL` → 발견 파일 → `BULC_BRIDGE_HOST`/`BULC_BRIDGE_PORT`(기본 `127.0.0.1:8787`).
- 앱을 `BULC_BRIDGE_AUTH=sensitive|all` 로 실행하면 파일·실행 도구(또는 전부)에 토큰이 필요합니다. 서버는 발견 파일의 토큰을 그 주소에만 `Authorization: Bearer` 로 보냅니다. 발견 파일을 읽을 수 없는 환경에서는 `BULC_BRIDGE_TOKEN` 을 씁니다.
- 발견 파일을 쓰지 않는 구버전 앱이 다른 포트에서 돌면 `BULC_BRIDGE_URL`(예: `http://127.0.0.1:8790`)을 지정합니다. `bulc_connection_status` 가 연결 여부, 주소를 찾은 경로, "BULC 가 아닌 프로그램이 응답함", 앱과 내장 스냅샷의 도구 집합 차이를 알려 줍니다.

### 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `BULC_BRIDGE_URL` | — | 브리지 전체 주소(가장 우선), 예: `http://127.0.0.1:8790` |
| `BULC_BRIDGE_DISCOVERY_FILE` | 앱과 같은 위치 | 발견 파일 경로를 바꿈. `0` 이면 읽지 않음 |
| `BULC_BRIDGE_TOKEN` | — | 브리지 토큰(발견 파일 없이 `BULC_BRIDGE_AUTH` 앱에 연결할 때) |
| `BULC_BRIDGE_PORT` / `BULC_BRIDGE_HOST` | `8787` / `127.0.0.1` | 발견 파일이 없을 때 쓰는 주소 |
| `BULC_MCP_PROFILE` | `full` | `compact`: 로컬 도구 + `bulc_find_tools`·`bulc_call` 만 노출(도구 수 상한이 있는 클라이언트용) |
| `BULC_MCP_TOOLSETS` | — | `full` 에서 노출할 앱 도구 분류(쉼표): `project, arch, geometry, fire, ventilation, device, mesh, material, surface, output, query, evac, spr, hvac, draw, furniture, result, shape` |
| `BULC_MCP_HIDE_TOOLS` | — | 숨길 도구(쉼표), 예: `project_new,sim_stop` |
| `BULC_MCP_HINTS` | `1` | `0` 이면 도구 설명 끝의 규칙 id 힌트를 붙이지 않음(힌트는 설명을 1,024자 넘게 늘리지 않음) |
| `BULC_MCP_MAX_DESCRIPTION` | — | 도구 설명 길이 상한(문자 수). 1,024자 제한이 있는 클라이언트는 `1024` |
| `BULC_MCP_CALL_TIMEOUT_MS` | `120000` | 앱 도구 호출 시간 제한(도면 분석·결과 읽기·열기 등 일부는 5분 이상) |
| `BULC_MCP_WATCH_MS` | `15000` | 앱 연결 감시 간격(`0` 이면 끔) |
| `BULC_MCP_ATTACH_IMAGES` | `1` | `0` 이면 `capture_view`·`shape_screenshot` 그림을 이미지로 첨부하지 않음 |
| `BULC_MCP_ALLOW_REMOTE` | `0` | `1` 이면 루프백이 아닌 브리지 주소 허용(권장하지 않음) |

### 도구

**이 서버의 로컬 도구** — 앱 없이도 동작하는 것은 ○ 로 표시했습니다.

| 도구 | 앱 없이 | 하는 일 |
|---|---|---|
| `bulc_connection_status` | ○ | 브리지 주소와 찾은 경로, 연결 여부, BULC 식별, 도구 수, 스냅샷과의 차이 |
| `bulc_knowledge_search` | ○ | 규칙 id·클래스·FDS 키·오류 번호·자유 낱말(한/영)로 지식 팩 검색 |
| `bulc_get_rules` | ○ | 영역·심각도·클래스·도구별 규칙 목록 |
| `bulc_plan_check` | ○ | 호출하려는 도구 순서를 규칙으로 점검(없는 도구·인자, 단위, XB 순서, HRR, 화원 지시, 바닥 개방, 재계산 누락, 헤드·단말 label, 도면 가져오기 dryRun, 실행 전 점검·확인, 피난 실행 순서 등) |
| `bulc_drawing_intake` | ○ | 도면 파일을 로컬에서 분류하고 플레이북·질문·도구 순서를 돌려줌. DXF 평면은 벽 중심선 후보 추출(구버전 앱용) |
| `bulc_check_deck` | ○ | FDS 6.10.1 덱 결정적 점검(파일·텍스트·앱의 현재 덱) |
| `bulc_mesh_advisor` | ○ | D* 와 셀 크기, 2·3·5 친화 IJK, 총 셀 수 |
| `bulc_find_tools` | ○ | 키워드로 앱 도구와 입력 스키마 찾기 |
| `bulc_call` | | (compact 프로필) 이름으로 앱 도구 호출 |
| `get_project_summary` | | 앱 프로젝트 짧은 요약(0.89 이상은 `project_info` 가 더 자세함) |
| `run_simulation` | | 모든 앱 버전용 실행 가드 — `validate_project` 를 먼저 돌려 오류가 있으면 실행하지 않음(0.89 이상은 `sim_preflight` → `sim_start` 권장) |

**앱 도구(BULC 0.89 기준 239종)**: 프로젝트·실행·결과 24 · 건축 도면 3 · 형상 14 · 화재 6 · 경계 5 · 장치·제어 14 · 격자 21 · 재료 6 · 표면 8 · 출력 10 · 조회·점검 7 · 피난 16 · 스프링클러·물분무 32 · HVAC 20 · 층 7 · 가구 3 · 결과 뷰어 11 · Shape Studio 32.
도구마다 읽기 전용·파괴적·멱등 주석이 붙고, 실행 중인 앱에서만 동작하는 도구(열기·저장·실행·캡처 등)는 "Live app only" 로 표시됩니다.

### 지식 팩

| 종류 | 위치 |
|---|---|
| 온톨로지 | `bulc://knowledge/ontology` (YAML), `bulc://knowledge/ontology.jsonld`, 클래스별 `bulc://knowledge/class/{name}` |
| 규칙 | `bulc://knowledge/rules`, 영역별 `bulc://knowledge/rules/{domain}`, 하나씩 `bulc://knowledge/rule/{id}` |
| 플레이북 | `bulc://knowledge/playbooks/01-architectural-drawing-fire-aset` … `06-troubleshooting` |
| 용어집 | `bulc://knowledge/glossary` |
| FDS 6.10.1 키 | `bulc://knowledge/fds-6.10.1/keys`, 그룹별 `bulc://knowledge/fds-6.10.1/namelist/{group}` |
| 도구 카드 | `bulc://tools/{name}` (설명·스키마·주석·관련 규칙) |
| 라이브 | `bulc://project/summary`, `bulc://project/deck` (앱 필요) |
| prompts | `bulc-start`, `drawing-to-fire-aset`, `evacuation-rset`, `hvac-smoke-control`, `sprinkler-design`, `marine-water-spray-iso`, `troubleshooting`, `review-fds-deck` |

LLM 이 지식 팩을 쓰는 방식:

1. **초기화 instructions** — 연결하면 서버가 핵심 규칙 10개(단위, 읽고 쓰기, 도면, 화원 지시, 실행 전 점검·확인, 결과 보고)를 보냅니다.
2. **도구 설명의 규칙 힌트** — 앱 도구마다 관련 규칙 id 가 붙어 있어(`[bulc-mcp rules] VENT-002 …`) 모델이 `bulc_knowledge_search "<id>"` 로 원문을 찾습니다.
3. **계획 점검** — 여러 단계 작업 전에 `bulc_plan_check` 가 도구 순서를 규칙으로 점검해 오류·경고와 따를 플레이북을 돌려줍니다(앱 없이 동작).
4. **오류 응답의 안내** — 앱이 인자를 거절하거나 없는 도구를 부르면 결과에 규칙 id 와 실제 도구 이름을 덧붙입니다.
5. **prompts·resources** — 작업별 prompt 가 플레이북 전문과 그 규칙을 한 번에 넣어 줍니다.

자세한 내용은 [knowledge/README.md](knowledge/README.md) 를 보십시오.

### 도면으로 작업하기

1. 도면을 PC 에 두고 **절대 경로**를 AI 에게 알려 줍니다(채팅 첨부 파일은 MCP 서버가 읽을 수 없습니다).
2. AI 가 `bulc_drawing_intake` 로 분류하고, 단위·축척·기준점·층고·최종 출구를 묻습니다.
3. **건축 평면도**: `arch_analyze_drawing` 이 벽·문·창·기둥·실명·층 표기를 인식하고 확인할 질문을 냅니다 → `arch_import_building` 을 dryRun(기본)으로 개수·크기를 보여 주고 → 동의하면 건물을 만듭니다(되돌리기 1단계). 그림이나 글자가 윤곽선인 PDF 는 AI 가 그림을 읽어 `arch_import_floorplan_report` 로 넣습니다.
4. **스프링클러 평면·배관 ISO**: `spr_analyze_drawing` → 열린 끝·참조선·모호한 항목 확인 → `spr_import_network`(먼저 dryRun) → 수리계산·펌프·검토.
5. 그 건물 위에서 화재(사용자가 정한 화원만), 피난, HVAC, 스프링클러 작업을 이어 갑니다. 실행은 `sim_preflight` → 조건 요약·확인 → `sim_start` 순서이고, 결과는 `fire_results_summary`·`fire_compute_aset`·`evac_get_results` 가 돌려준 값만 보고합니다.

합성 예제: [examples/](examples/) (평면 DXF, 물분무 ISO DXF, FDS 덱, 예시 세션).

### 개인정보와 보안

- 서버는 사용자 PC 에서만 실행되고 `127.0.0.1` 의 BULC 앱에만 연결합니다. 텔레메트리는 없습니다.
- 서버가 직접 읽는 파일은 사용자가 지정한 도면·덱과 앱의 발견 파일뿐이며, 어디에도 올리지 않습니다. 브리지 토큰은 그 앱 주소에만 보냅니다.
- 다만 **도구 결과(도면 인식 요약, 화면 캡처 포함)는 대화의 일부로 사용자가 쓰는 AI 공급자에게 전달됩니다.** 보안이 엄격한 도면은 로컬 LLM 을 쓰는 MCP 클라이언트를 검토하십시오.
- 자세한 내용: [PRIVACY_POLICY.md](PRIVACY_POLICY.md), [SECURITY.md](SECURITY.md)

### 문제 해결

| 증상 | 조치 |
|---|---|
| "BULC 앱에 연결할 수 없습니다" | 앱을 실행하고 `bulc_connection_status` 로 확인. 구버전 앱이 다른 포트에서 돌면 `BULC_BRIDGE_URL` 지정 |
| "BULC 가 아닌 프로그램이 응답합니다" | 다른 프로그램이 같은 포트를 씀 → 앱을 켜 두면 발견 파일로 찾음. 안 되면 앱을 빈 포트로 실행하고 `BULC_BRIDGE_URL` 지정 |
| "브리지 토큰이 필요합니다" | 앱이 `BULC_BRIDGE_AUTH` 로 실행됨 → 발견 파일을 읽을 수 있게 하거나 `BULC_BRIDGE_TOKEN` 설정 |
| 앱을 켰는데 도구 목록이 그대로 | 클라이언트가 `tools/list_changed` 를 지원하지 않으면 클라이언트를 다시 시작 |
| `Tool input error` | 앱이 인자를 검증한 결과입니다. 문구가 제안하는 인자 이름으로 다시 호출 |
| `project_*`·`sim_*`·`arch_*` 가 없음 | 0.88 이하 앱입니다. 앱을 업데이트하거나 규칙의 대안(파일 메뉴, `run_simulation`, 수동 벽 입력)을 따름(GEN-014, GEN-016, DRW-004) |
| 도구가 너무 많다는 오류 | `BULC_MCP_PROFILE=compact` 또는 `BULC_MCP_TOOLSETS` 사용 |

### 라이선스

이 서버의 코드와 지식 팩은 [MIT](LICENSE) 입니다. BULC 데스크톱 앱과 해석 엔진은 별도의 상용 라이선스로 제공되며 이 저장소에 포함되지 않습니다.
"BULC" 는 Meteor Simulation 의 상표이며, MIT 라이선스는 상표 사용권을 주지 않습니다. 인용한 외부 자료의 출처는 [NOTICE.md](NOTICE.md) 에 있습니다.

---

## English

### What it is

BULC MCP is a [Model Context Protocol](https://modelcontextprotocol.io) server. It lets the AI in an MCP client — Claude Desktop,
Claude Code, Cursor, VS Code and others — drive **the BULC desktop app running on the same PC** (a GPU fire simulator built on
FDS 6.10.1, with a 2D/3D building editor) in plain language.

- **Every app feature**: opening and saving projects, drawing recognition, geometry, Shape Studio, meshing, run settings, pre-flight
  checks, runs and progress, outputs, fires, materials, detectors and controls, sprinkler / water-spray networks with hydraulics, pump
  sizing and design review, HVAC ducts, evacuation set-up, runs and results, fire result summaries and ASET, the result viewer and
  screenshots — **239 app tools** as of BULC 0.89, taken live from the app so new app versions bring new tools without reinstalling
  this server.
- **Work from drawings**: give the AI the local path of a DWG, DXF, PDF, image, ZIP bundle or IFC file. `bulc_drawing_intake`
  classifies it **on your PC** and returns the playbook. The app recognises architectural floor plans (walls, doors, windows, columns,
  room names) and builds the building (`arch_analyze_drawing` → `arch_import_building`), and turns sprinkler / water-spray piping
  drawings into pipe networks (`spr_analyze_drawing` → `spr_import_network`).
- **A knowledge pack that prevents mistakes**: an ontology (79 classes), 166 rules (condition → check → fix), 38 common LLM
  mistakes, six playbooks, a Korean–English–FDS–tool glossary and an FDS 6.10.1 key reference, served as MCP resources, prompts and
  tools. Plans and decks are checked before acting (`bulc_plan_check`, `bulc_check_deck`).

This repository contains no BULC application or solver source. The server is a thin client of the bridge the app opens on
`127.0.0.1`.

### What it can do, by domain

| Domain | Key tools | Flow |
|---|---|---|
| Project | `project_info`, `project_open`, `project_save`, `project_export_fds`, `project_undo`, `fds_apply_text`, `capture_view` | read → edit → save (overwrite only after consent) |
| Drawing → building | `arch_analyze_drawing`, `arch_import_building`, `arch_import_floorplan_report` | recognise → confirm → dry run → build (one undo step) |
| Fire & smoke | `set_mesh`, `add_fire`, `set_all_boundaries_open`, `output_add_tenability_slices`, `sim_preflight`, `sim_start`, `sim_status` | mesh → fire (user-given) → boundaries → outputs → check → consent → run |
| Results & ASET | `results_detect`, `fire_results_summary`, `fire_timeseries`, `fire_compute_aset` | peak HRR, detector times → ASET per exit at 1.8 m |
| Evacuation & RSET | `evac_add_agents_batch`, `evac_add_stair`, `evac_run`, `evac_status`, `evac_get_results` | place → stairs/routes → run → per-exit statistics, RSET |
| HVAC smoke control | `hvac_add_node`, `hvac_add_duct`, `hvac_run_calc`, `hvac_apply_to_fds` | network → airflow → FDS |
| Sprinkler & water spray | `spr_analyze_drawing`, `spr_import_network`, `spr_run_calc`, `spr_pump_sizing`, `spr_design_review`, `spr_apply_to_fds` | recognise / lay out → hydraulics → pump & review → FDS activation |

BULC 0.88 and older lack `project_*`, `sim_*`, `fire_*`, `evac_run`, `arch_*` and `capture_view`; the rules describe the fallbacks.

### Requirements

1. The **BULC desktop app** (licensed), running — 0.89 or later recommended (0.88 works with the smaller tool set). Installer:
   [Meteor-Simulation/bulc-releases](https://github.com/Meteor-Simulation/bulc-releases/releases/latest). The bridge is on by
   default (`BULC_BRIDGE=0` in the app's environment turns it off).
2. **Node.js 20+**
3. An MCP client.

### Install

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "bulc": { "command": "npx", "args": ["-y", "@meteor-simulation/bulc-mcp"] } } }
```

Claude Code: `claude mcp add bulc --scope user -- npx -y @meteor-simulation/bulc-mcp`

Cursor / VS Code: same command; clients with a tool-count limit should set `BULC_MCP_PROFILE=compact`.
From source: `git clone`, `npm install` (builds in `prepare`), then run `node build/server.js`.

### Finding the app

No configuration is needed. When BULC (0.89+) opens its bridge it writes a **discovery file** `BULC/bridge.json` in the user's
config folder (`%APPDATA%\BULC\bridge.json` on Windows); this server reads the address, port and token from it — also when the app runs
on a port other than 8787. Files left behind by an app that has ended are ignored. Order: `BULC_BRIDGE_URL` → discovery file →
`BULC_BRIDGE_HOST`/`BULC_BRIDGE_PORT` (default `127.0.0.1:8787`). With `BULC_BRIDGE_AUTH=sensitive|all` in the app, the token from the
discovery file is sent as `Authorization: Bearer` to that address only; `BULC_BRIDGE_TOKEN` covers set-ups without the file. All
environment variables are listed in the Korean section above.

### Tools, knowledge and prompts

- Local tools: `bulc_connection_status`, `bulc_knowledge_search`, `bulc_get_rules`, `bulc_plan_check`, `bulc_drawing_intake`,
  `bulc_check_deck`, `bulc_mesh_advisor`, `bulc_find_tools` (all work without the app), `bulc_call` (compact profile),
  `get_project_summary`, `run_simulation` (guarded run for any app version).
- App tools carry read-only / destructive / idempotent annotations, "Live app only" marks, side-effect notes and, by default, a
  short list of related rule ids — never pushing a description past 1,024 characters.
- App pictures (`capture_view`) arrive as image content and structured results as `structuredContent`.
- Resources: `bulc://knowledge/{index, ontology, ontology.jsonld, rules, glossary, fds-6.10.1/keys}`, playbooks, templates
  `bulc://knowledge/rule/{id}`, `…/rules/{domain}`, `…/class/{name}`, `…/fds-6.10.1/namelist/{group}`, `bulc://tools/{name}`,
  live `bulc://project/summary` and `bulc://project/deck`, and the synthetic `bulc://examples/…`.
- Prompts: `bulc-start`, `drawing-to-fire-aset`, `evacuation-rset`, `hvac-smoke-control`, `sprinkler-design`,
  `marine-water-spray-iso`, `troubleshooting`, `review-fds-deck`.

### Example session (synthetic)

```
user: Build a fire model from D:\work\office-plan-synthetic.dxf — ground floor, 3 m storey, exit on the south side.
→ bulc_connection_status · project_info · bulc_drawing_intake {"path": "D:\\work\\office-plan-synthetic.dxf", "purpose": "fire"}
→ arch_analyze_drawing {"filePath": "D:\\work\\office-plan-synthetic.dxf"} → mm, 5 walls, 2 doors, 1 window + questions
assistant: confirms units, origin, which door is the final exit and the fire scenario (no fire until the user gives one — GEN-015)
→ arch_import_building {"candidateId": "…", "story": 1} (dry run) → user agrees → … "dryRun": false
→ bulc_plan_check {...} → set_mesh · set_all_boundaries_open · add_fire · output_add_tenability_slices · set_time
→ sim_preflight → summary → user confirms → project_save → sim_start {"confirm": true} → sim_status … → fire_compute_aset
```

More in [examples/sessions](examples/sessions).

### Privacy and security

The server runs on your PC and talks only to the BULC app on `127.0.0.1`; no telemetry. It reads only the files you point it to
and the app's discovery file, and uploads nothing; the bridge token is sent only to that app. **Tool results (including drawing
summaries and screenshots) become part of your conversation with the AI provider you use** — consider an MCP client with a local
model for confidential drawings. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and [SECURITY.md](SECURITY.md).

### Development

```bash
npm install
npm run check          # typecheck, build, tests, knowledge lint, public-content scan, licence check, package contents
npm run gen:examples   # regenerate the synthetic DXF examples
node scripts/import-snapshot.mjs <export.json> --app-version X.Y.Z   # refresh the bundled tool snapshot
```

### License

The server code and the knowledge pack are [MIT](LICENSE). The BULC desktop app and its solvers are commercial software under a
separate licence and are not part of this repository. "BULC" is a trademark of Meteor Simulation; the MIT licence grants no
trademark rights. Sources cited by the knowledge pack are listed in [NOTICE.md](NOTICE.md).
