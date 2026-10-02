# BULC 지식 팩 — LLM 이 BULC MCP 를 틀리지 않게 쓰기 위한 온톨로지·규칙·플레이북

이 폴더는 BULC MCP 서버(화재·연기 해석, 피난, HVAC 제연, 스프링클러·물분무 수리계산)를 조작하는 LLM 에이전트가 참고하는 자료입니다.
도구 사용법(인자·스키마)은 서버의 `tools/list` 가 알려 주고, 이 폴더는 **무엇을 어떤 순서로, 어떤 단위와 좌표로, 무엇을 확인하며** 해야 하는지를 알려 줍니다.

기준: FDS 6.10.1, BULC 도구 목록(앱 0.90, 2026-10). 0.88 이하 앱에서 달라지는 점(프로젝트 파일·실행·피난 실행·건축 도면 도구가 없음)은 각 규칙의 fix 에 대안으로 적었습니다(`ontology.yaml` `conventions.app_versions`). 엔진 지원 범위가 바뀔 수 있는 규칙은 `confidence: engine_snapshot`, 법규 힌트는 `confidence: regulatory_verify` 로 표시했습니다.

*English summary: this folder is the knowledge pack an LLM agent reads while driving BULC — a domain ontology, 166 machine-readable
rules (condition → check → fix) with 38 common LLM mistakes, six step-by-step playbooks, a Korean ↔ English ↔ FDS ↔ tool glossary
and an FDS 6.10.1 key reference. Rule and class names are English; explanations are Korean with English titles.*

## MCP 로 읽는 법 / How agents read it

| 방법 | 예 |
|---|---|
| MCP resources | `bulc://knowledge/index`(이 문서), `bulc://knowledge/ontology`, `bulc://knowledge/rules`, `bulc://knowledge/rule/FIRE-001`, `bulc://knowledge/rules/sprinkler`, `bulc://knowledge/class/Mesh`, `bulc://knowledge/playbooks/<이름>`, `bulc://knowledge/glossary`, `bulc://knowledge/fds-6.10.1/keys`, `bulc://knowledge/fds-6.10.1/namelist/PROP` |
| MCP prompts | `bulc-start`, `drawing-to-fire-aset`, `evacuation-rset`, `hvac-smoke-control`, `sprinkler-design`, `marine-water-spray-iso`, `troubleshooting`, `review-fds-deck` |
| 로컬 도구(앱 없이 동작) | `bulc_knowledge_search`(규칙 id·키워드), `bulc_get_rules`(영역·심각도·도구별), `bulc_plan_check`(계획 점검), `bulc_drawing_intake`(도면 분류), `bulc_check_deck`(덱 점검), `bulc_mesh_advisor`(격자 조언) |
| 도구 설명 | 앱 도구 설명 끝에 관련 규칙 id 가 붙습니다(`[bulc-mcp rules] …`). |

## 파일

| 파일 | 내용 | 언제 읽나 |
|---|---|---|
| `ontology.yaml` | 도메인 클래스(프로젝트·층·격자·벽·화원·장치·출력·피난·HVAC·배관망·도면 …), 속성의 단위, 관계, 각 객체를 만드는 도구, 관련 규칙 | 작업 시작 시 `conventions` 부분, 객체를 다룰 때 해당 클래스 |
| `ontology.jsonld` | 같은 온톨로지의 JSON-LD 판(`scripts/build_ontology_jsonld.py` 로 생성) | 그래프·검색 도구에 넣을 때 |
| `rules.yaml` | 기계가 읽는 규칙 166개(id, 분야, 심각도, 적용 대상, 조건, 확인 도구, 고치는 법)와 흔한 LLM 실수 38개 | 각 단계 전후, 오류가 났을 때 |
| `playbooks/01-architectural-drawing-fire-aset.md` | 건축 도면 → 건물 모델 → 화재·연기 해석 → ASET | |
| `playbooks/02-evacuation-fed-rset.md` | 피난 + FED 화재 연계 → RSET | |
| `playbooks/03-hvac-smoke-control.md` | HVAC 제연(배출·급기) | |
| `playbooks/04-sprinkler-design-fds-activation.md` | 스프링클러 설계 → 수리계산 → FDS 작동 해석 | |
| `playbooks/05-marine-water-spray-iso.md` | 배관 ISO 도면 → 구역 → 수원압력 역산 → 펌프 → 설계 검토 → 계산서 | |
| `playbooks/06-troubleshooting.md` | 증상 → 원인 → 확인 → 고치는 법 | 막혔을 때 |
| `glossary.md` | 한국어 ↔ English ↔ FDS 키워드 ↔ BULC 도구, 단위 바꾸기 표 | 사용자 표현을 도구로 옮길 때 |
| `fds-6.10.1/keys.yaml` | 자주 쓰는 FDS 6.10.1 namelist 키(형식·단위·기본값·흔한 실수·BULC 도구)와 자주 보는 입력 오류 번호 | 덱을 읽거나 고칠 때 |
| `scripts/validate_knowledge.py` | 규칙 id·클래스 참조·JSON-LD 최신 여부 점검(선택: 도구 목록 대조) | 이 폴더를 고친 뒤 |

## LLM 작업 순서(요약)

1. `bulc_connection_status` 로 앱 연결을 확인하고, `tools/list` 로 쓸 수 있는 도구를 확인합니다. 없는 도구를 가정하지 않습니다(GEN-018, GEN-005). `project_info` 로 열린 프로젝트를 읽습니다.
2. `ontology.yaml` 의 `conventions` 로 단위·좌표·층 번호 규칙을 확인합니다(GEN-001, GEN-002, EVAC-001). 앱의 `get_conventions` 도 같은 내용을 돌려줍니다.
3. 도면이 있으면 `bulc_drawing_intake` 로 분류하고, 요청에 맞는 플레이북을 고르고 그 순서대로 진행합니다. 건축 평면은 `arch_analyze_drawing` → `arch_import_building`(dryRun 먼저), 배관 도면은 `spr_analyze_drawing` → `spr_import_network`(dryRun 먼저)입니다(DRW-004, DRW-006).
4. 여러 단계 작업은 `bulc_plan_check` 로 먼저 점검합니다. 편집 묶음마다 `validate_project`, 덱은 `preview_fds` 로 확인합니다(GEN-006, GEN-007).
5. 배관망·HVAC 를 고쳤으면 계산을 다시 돌리고, 헤드·단말 노드에는 겹치지 않는 label 을 줍니다(SPR-004, HVAC-003, GEN-021).
6. 화원은 사용자가 지시할 때만 만들고, 실행 전에는 `sim_preflight` → 조건 요약 → 사용자 확인 → `sim_start` 입니다(GEN-015, GEN-016). 피난은 `evac_run` → `evac_status` → `evac_get_results` 입니다(EVAC-004).
7. 결과는 `fire_results_summary`·`fire_compute_aset`·`evac_get_results` 가 돌려준 값만 말하고, 법규 값은 "원문 확인 필요"로 표시합니다(GEN-010, LLM-028).

## 규칙 형식

```yaml
- id: VENT-002            # 분야 접두어 + 번호
  domain: boundary
  severity: error         # error | warning | info
  confidence: verified    # verified | convention | guidance | regulatory_verify | engine_snapshot
  applies_to: [OpenBoundary, Fire]   # ontology.yaml 클래스
  title: "…"              # 한국어
  title_en: "…"           # English
  condition: "…"          # 틀린 상태
  check: {tools: [...], how: "…"}
  fix: {tools: [...], how: "…"}
```

분야 접두어: GEN 일반, GEO 형상, MESH 격자, VENT 경계, FIRE 화재, SURF 표면, DEVC 장치·제어, OUT 출력, SIM 해석·엔진, EVAC 피난, HVAC 공조·제연, SPR 스프링클러·물분무, ASET 인명안전 판정, DRW 도면, TRB 문제 해결, LLM 흔한 실수.

## 출처와 한계

- FDS 키·기본값·오류 번호는 NIST FDS 6.10.1 사용자 안내서와 공개 FDS 6.10.1 입력 판독기(미국 정부 저작물, 공공 영역)를 기준으로 했습니다.
- 법규 값(NFTC, NFPA, 선급·협약 등)은 힌트입니다. `regulatory_verify` 규칙은 적용 시점의 원문과 발주처 요구로 반드시 확인하십시오. 유료 표준의 본문은 옮기지 않았습니다.
- `engine_snapshot` 규칙은 BULC GPU 엔진의 시점 기준 지원 범위입니다. 실행 로그 경고와 `validate_project` 결과가 우선합니다.

## 고칠 때

- `ontology.yaml` 이 원본입니다. 고친 뒤 `python knowledge/scripts/build_ontology_jsonld.py` 로 JSON-LD 를 다시 만들고 `npm run lint:knowledge`(또는 `python knowledge/scripts/validate_knowledge.py`, PyYAML 필요)를 돌립니다.
- YAML 키에 `on`, `off`, `yes`, `no` 를 쓰지 않습니다(YAML 1.1 에서 불린으로 읽힘).
- 예시는 합성 값만 씁니다. 실제 고객 도면·결과·이름을 넣지 않습니다.
