# 예시 세션 1 — 평면도 DXF → 건물 → 화재 모델 → ASET (합성)

모든 값과 파일은 합성 예제입니다. 실제 건물·프로젝트와 관계가 없습니다. 도구 응답은 줄여서 적었습니다. BULC 0.90 기준입니다.

**사용자**: `D:\work\office-plan-synthetic.dxf` 사무실 평면으로 화재 모델 만들어 줘. 1층만, 층고 3 m.

**어시스턴트** (생각: 앱 연결·프로젝트·도면 분류부터, 화원은 아직 지시가 없음 — GEN-015)

```
bulc_connection_status {}
→ BULC 앱 연결됨 · bridge http://127.0.0.1:8790 (from the app's discovery file (BULC/bridge.json)) · app tools (live): 239
  tool set: identical to the bundled snapshot.

project_info {}
→ filePath: null · isDirty: false · stories: [{id: 1, name: "1F", zMin: 0, height: 3}] · counts: obstacles 0 …

bulc_drawing_intake {"path": "D:\\work\\office-plan-synthetic.dxf", "purpose": "fire"}
→ kind: architectural_plan (confidence high) · DXF units millimetre ($INSUNITS=4)
  playbook: bulc://knowledge/playbooks/01-architectural-drawing-fire-aset
  tool sequence: … arch_analyze_drawing → arch_import_building (dryRun) → … sim_preflight → sim_start …

arch_analyze_drawing {"filePath": "D:\\work\\office-plan-synthetic.dxf"}
→ candidateId arch_… · units mm (insunits, medium) · double-line walls
  building: 19.8 × 11.8 m · walls 5 (0.20 m × 4, 0.10 m × 1) · doors 2 · windows 4 · rooms ROOM A, ROOM B
  questions: 이 도면이 몇 층 평면인지, 층고와 슬래브 두께를 확인해 주십시오
```

**어시스턴트**: 도면은 mm 단위로 읽혔고, 벽 5개(외벽 0.2 m 4개, 칸막이 0.1 m 1개)·문 2개·창 4개·실 2개(ROOM A, ROOM B)를 찾았습니다. 다음을 알려 주세요.
1. 1층 평면, 층고 3 m 로 두어도 됩니까? 기준점은 건물 왼쪽 아래 모서리입니다.
2. 문 2개 가운데 남쪽 외벽의 문이 최종 출구입니까? 칸막이 문은 실내 문이라 출구로 잡히면 RSET 이 짧아집니다(EVAC-003).
3. 화재 위치와 최대 열방출률(예: 1 MW, fast)은 어떻게 둘까요? 정해 주시기 전에는 화원을 만들지 않습니다.

**사용자**: 맞아. 남쪽 문이 출구. 화재는 ROOM A 가운데 1 MW fast. 피난은 나중에.

```
arch_import_building {"candidateId": "arch_…", "story": 1}
→ 건물 가져오기 점검 (dryRun — 바꾸지 않음)
  created: walls 5 · doors 2 · windows 4 · suggestedMesh …
  notes: 문 구멍 id 는 'Door_' … 창 구멍 id 는 'Win_' 입니다 — 피난 출구가 아닙니다 …
```

**어시스턴트**: 벽 5개·문 2개·창 4개를 만듭니다(되돌리기 한 단계). 칸막이 문도 `Door_` 구멍이라 나중에 피난 해석을 하면 출구로 잡힙니다 — 피난 단계에서 다시 정하겠습니다(EVAC-003).

```
arch_import_building {"candidateId": "arch_…", "story": 1, "dryRun": false}
→ 건물을 만들었습니다 (되돌리기 1단계: project_undo) — 벽 5개(장애물 5), 문 2, 창 4

capture_view {"view": "2d", "story": 1}
→ (2D 평면 그림)
```

계획을 먼저 점검합니다.

```
bulc_plan_check {"goal": "ROOM A 가운데 1 MW fast 화재", "fire_requested_by_user": true, "steps": [
  {"tool": "set_mesh", "args": {"ni": 108, "nj": 72, "nk": 18, "xb": [-1, 21, -1, 13, 0, 3.6]}},
  {"tool": "add_fire", "args": {"hrrpua": 500, "xb": [4, 6, 5.5, 6.5, 0, 0], "growth": "fast", "time_to_peak": 146, "tmp_front": 20}},
  {"tool": "set_all_boundaries_open"},
  {"tool": "output_add_tenability_slices", "args": {}},
  {"tool": "sim_start", "args": {"confirm": true}}
]}
→ verdict: fix_before_acting — 2 error(s), 1 warning(s) …
  - [error] VENT-002 (step 3): set_all_boundaries_open without faces opens ZMIN (the floor) too …
  - [error] GEN-006 (step 5): sim_start at step 5: no validate_project / sim_preflight after the last edit (step 4) …
  - [warning] GEN-016 (step 5): Summarise the run conditions … get the user's go-ahead before sim_start.
  - [info] FIRE-001 (step 2): add_fire: HRRPUA 500 kW/m² × 2.00 m² ≈ 1000 kW total …
  - [info] FIRE-005 (step 5): The plan never sets T_END …
```

계획을 고쳐(바닥을 뺀 열 면, T_END, 사전 점검, 실행 전 확인) 진행합니다.

```
bulc_mesh_advisor {"hrr_kw": 1000, "domain_xb": [-1, 21, -1, 13, 0, 3.6], "cell_size": 0.2}
→ D* = 0.959 m · IJK = 108, 72, 18 · total cells = 139,968 · D*/dx = 4.7

set_mesh {"ni": 108, "nj": 72, "nk": 18, "xb": [-1, 21, -1, 13, 0, 3.6]}
update_reaction {"fuel": "PROPANE", "soot_yield": 0.024, "co_yield": 0.005}
add_fire {"hrrpua": 500, "xb": [4, 6, 5.5, 6.5, 0, 0], "growth": "fast", "time_to_peak": 146, "tmp_front": 20}
set_all_boundaries_open {"faces": ["XMIN", "XMAX", "YMIN", "YMAX", "ZMAX"]}
output_add_tenability_slices {}
set_time {"t_end": 600}
sim_preflight {}
→ ok: true · errors 0 · warnings: MESH-002 (D*/dx 4.7 — 성긴 편) …
```

**어시스턴트**: 조건 요약 — 격자 108×72×18(0.2 m, 139,968 셀, D*/dx ≈ 4.7 로 성긴 편), 화원 ROOM A 1 MW fast(146 s 에 최대), 바닥을 뺀 바깥 면 개방, T_END 600 s, 1.8 m 판정 슬라이스, GPU 엔진. `D:\work\office_fire_A.bulc` 로 저장하고 실행할까요?

**사용자**: 실행해.

```
project_save {"path": "D:\\work\\office_fire_A.bulc"}
sim_start {"confirm": true}
sim_status {}
→ running · 41 % (t = 246 s / 600 s) · nan 0 · Tmax 1,180 K · |u| max 6.2 m/s
… (끝날 때까지 sim_status)
fire_results_summary {}
fire_compute_aset {}
→ Door_A1_1 (남쪽 출구): ASET ≥ 600 s (lower bound — no criterion exceeded) …
```

결과 수치는 도구가 돌려준 값만 보고합니다(GEN-010). 위 숫자는 합성 예시입니다.
