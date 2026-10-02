# 플레이북 01 — 건축 도면 → 건물 모델 → 화재·연기 해석 → ASET

건축 평면도(DWG, DXF, PDF, 이미지)를 받아 BULC 건물 모델을 만들고, 화재·연기 해석을 준비·실행한 뒤 피난 허용 시간(ASET)을 판정하는 순서입니다.
도구 이름과 인자는 BULC MCP 서버 기준이며, 시작 전에 `tools/list` 로 확인합니다(규칙 GEN-005).
BULC 0.90 이상을 기준으로 쓰고, 그 이전 앱에서 쓰는 대안 경로를 함께 적었습니다.
예시 값은 모두 합성 예제(2층 사무소, 20 m × 12 m)입니다.

## 0. 시작 전 확인

1. 연결을 확인합니다: `bulc_connection_status {}`.
   - **연결됨(라이브 모드)**: 편집이 앱 화면에 바로 보이고, 도면 인식(`arch_*`), 저장(`project_save`), 실행(`sim_start`), 결과 읽기(`fire_*`), 화면 캡처(`capture_view`)를 쓸 수 있습니다. 응답에 "app is OLDER than this server's snapshot" 이 나오면 아래의 "구버전 앱" 경로를 씁니다.
   - **연결 안 됨(스냅샷 모드)**: 앱 도구는 호출되지 않습니다. 사용자에게 BULC 앱 실행을 요청하고, 그동안은 `bulc_drawing_intake`, `bulc_plan_check`, `bulc_mesh_advisor` 로 계획만 세웁니다(GEN-018, GEN-010).
   - 도면은 `bulc_drawing_intake {"path": "<절대 경로>"}` 로 먼저 분류합니다. 파일은 이 PC 에서만 읽고 어디에도 올리지 않습니다(GEN-012).
2. `project_info {}` 로 지금 열린 프로젝트(파일·저장 안 된 변경·층)를 읽습니다. 새 프로젝트가 필요하면 사용자 확인 뒤 `project_new {}` 를 부릅니다(저장 안 된 변경이 있으면 거절되므로 먼저 저장 여부를 묻습니다, GEN-014).
3. 사용자에게 다음을 받습니다. 없는 값은 지어내지 말고 묻거나 "가정"으로 표시합니다(GEN-011).

| 항목 | 예시(합성) | 비고 |
|---|---|---|
| 도면 파일 경로와 단위 | `D:/work/office_plan.dxf`, mm | 축척을 확정합니다(DRW-001) |
| 해석할 층, 층고, 슬래브 두께 | 1F·2F, 층고 3.0 m, 슬래브 0.2 m | |
| 최종 출구 문 | 남쪽 외벽 문 | 실내 문은 출구가 아님(EVAC-003) |
| 화재 시나리오 | 1층 사무실 중앙, 최대 1 MW, fast t² | 출처를 기록합니다 |
| 연료·수율 | PROPANE, soot 0.024, CO 0.005 | 연소물에 맞춥니다(FIRE-007) |
| 해석 시간 | 600 s | 예상 RSET 의 1.5배 이상(FIRE-005) |
| 판정 기준 | 1.8 m, 60 °C, 5 m, CO 1,400 ppm, O₂ 15 %, CO₂ 5 % | 원문 확인(ASET-002) |

## 1. 도면 인식 — `arch_analyze_drawing`

앱이 도면을 이 PC 에서 직접 읽습니다(.dxf, .dwg 는 앱에 들어 있는 변환기로, 벡터 .pdf, 그림). 배관용 `spr_analyze_drawing` 은 쓰지 않습니다(DRW-004).

```
arch_analyze_drawing {"filePath": "D:/work/office_plan.dxf"}
arch_analyze_drawing {"candidateId": "<id>", "show": "walls"}
arch_analyze_drawing {"candidateId": "<id>", "show": "openings"}
```

- 요약의 `units`(근거·신뢰도), 벽·문·창·기둥 수, 실명·층 표기, `questions` 를 사용자에게 표로 보여 주고 확인받습니다(DRW-001, DRW-003).
- 축척이 틀리면 `options` 로 다시 분석합니다: `arch_analyze_drawing {"filePath": "...", "options": {"scaleMmPerUnit": 1, "wallLayers": ["A-WALL"]}}`.
- 결과가 `needsVision`(그림, 글자가 윤곽선인 PDF)이면 그림을 직접 읽어 벽 중심선·문·창을 0~1 정규화 좌표로 적고, 건물 실제 폭은 사용자에게 확인받아 `arch_import_floorplan_report` 로 넣습니다(DRW-008).

## 2. 건물 만들기 — `arch_import_building` (dryRun 먼저)

```
draw_list_stories {}
arch_import_building {"candidateId": "<id>", "story": 1}
arch_import_building {"candidateId": "<id>", "story": 1, "dryRun": false}
list_obstacles {}
capture_view {"view": "2d", "story": 1}
```

- 첫 호출은 기본이 dryRun 입니다. 만들 벽·문·창·기둥 수, 건물 크기, `suggestedMesh`, `warnings` 를 보여 주고 동의를 받은 뒤 `dryRun: false` 로 만듭니다. 만든 건물은 되돌리기 한 단계입니다(`project_undo`).
- 문은 `Door_<접두어>n` HOLE 이라 **모두 피난 출구**가 되고, 창은 `Win_<접두어>n` 이라 출구가 아닙니다(EVAC-003). 실내 문을 출구로 쓰지 않으려면 사용자에게 알리고 `excludeOpenings` 로 빼거나 나중에 id 를 바꿉니다.
- 손으로 쓴 건물(`building`)의 문·창 `wall` 번호는 1 부터 셉니다(wall 1 = `building.walls[0]`). 붙일 벽을 찾지 못한 개구부는 `warnings` 에 이유가 나옵니다.
- 2층은 `draw_add_story {}` 로 층을 만들고 같은 `transform.origin` 으로 `story: 2` 에 가져옵니다. 층 사이 슬래브는 `include.ceilingSlab` 이나 `add_floor` 로 넣습니다(GEO-007). 계단·샤프트 위치는 슬래브를 뚫습니다(GEO-008).
- 층 id 는 1부터(1F = 1)이고, 피난 도구의 floorIndex 는 0부터입니다(EVAC-001). 기본 규칙에서 1F zMin = 0, 2F zMin = 3.2 m 입니다(GEO-002).

### 구버전 앱(arch_* 가 없을 때)

`bulc_drawing_intake {"path": "...", "extract_geometry": true}` 가 DXF 의 벽 중심선 후보를 미터로 돌려줍니다. 표로 확인받은 뒤 직접 입력합니다(DRW-003).

```
draw_set_wall_params {"wallHeight": 3.0, "wallThickness": 0.2}
add_wall {"id": "W1_S", "start": [0, 0], "end": [20, 0], "height": 3.0, "thickness": 0.2, "z_base": 0}
add_wall {"id": "W1_E", "start": [20, 0], "end": [20, 12], "height": 3.0, "thickness": 0.2, "z_base": 0}
add_floor {"id": "SLAB_2F", "x_min": 0, "x_max": 20, "y_min": 0, "y_max": 12, "z": 3.2, "thickness": 0.2}
add_door {"id": "Door_EXIT_1", "wall_id": "W1_S", "position": 0.25, "width": 1.2, "height": 2.1}
add_window {"id": "Win_2F_1", "wall_id": "W2_N", "position": 0.5, "width": 1.5, "height": 1.2, "sill_height": 0.9}
add_hole {"id": "STAIR_OPEN_2F", "xb": [17, 19.6, 9, 11.6, 2.98, 3.22]}
```

좌표 변환 규칙: 도면 mm × 0.001 = m(GEN-001), 이미지 픽셀 y 는 위아래를 뒤집습니다(GEN-002), 도면 원점은 한 기준점을 (0,0) 으로 옮깁니다(DRW-002). 대각 벽은 짧은 직교 벽으로 나눕니다(GEO-014). 가구 선·치수선·마감선은 옮기지 않습니다(DRW-005).

확인할 점(두 경로 공통):
- 지상층 바닥 슬래브는 만들지 않습니다. 영역 바닥이 이미 벽입니다(GEO-001).
- 화재 시 닫혀 있다고 보는 창·문은 HOLE 을 만들지 않습니다(GEO-013). 문 폭은 셀 2개 이상이어야 막히지 않습니다(GEO-003).
- 필요하면 재료를 입힙니다: `add_surface_from_library` → `assign_surface`.

## 3. 계산 격자

셀 크기는 화원 D* 로 정합니다(MESH-002). 1 MW 이면 D* ≈ 0.96 m 이므로 0.06–0.24 m, 이 예제는 0.2 m 입니다. 외기로 통하는 면은 건물 밖으로 1 m 넓힙니다(MESH-008). `arch_import_building` 의 `suggestedMesh` 도 참고합니다.

```
bulc_mesh_advisor {"hrr_kw": 1000, "domain_xb": [-1, 21, -1, 13, 0, 6.6], "cell_size": 0.2}
set_mesh {"ni": 110, "nj": 70, "nk": 33, "xb": [-1, 21, -1, 13, 0, 6.6]}
list_meshes {}
```

- 셀 수 254,100 — GPU 메모리 문제 없음(MESH-007).
- 좁은 곳만 촘촘히 하려면 `auto_multimesh {"min_cell": 0.1, "max_cell": 0.4}` 를 쓰고, 그 뒤에는 `set_mesh` 계열을 부르지 않습니다(MESH-004, MESH-005).

## 4. 화원과 반응

사용자가 화재 시나리오를 준 경우에만 만듭니다(GEN-015). t² 성장의 time_to_peak 은 최대 HRR 에 맞춰 계산합니다: fast α = 0.0469 kW/s², 1,000 kW → √(1000/0.0469) ≈ 146 s(FIRE-004).
HRRPUA = 1,000 kW ÷ (2 m × 1 m) = 500 kW/m²(FIRE-001). `tmp_front: 20` 을 명시합니다(FIRE-006).

```
update_reaction {"fuel": "PROPANE", "soot_yield": 0.024, "co_yield": 0.005}
add_fire {"hrrpua": 500, "xb": [9, 11, 5, 6, 0, 0], "growth": "fast", "time_to_peak": 146, "tmp_front": 20}
```

응답의 `total HRR=1000 kW` 를 목표와 비교합니다. 윗층 화원은 z 를 그 층 zMin 으로 둡니다(FIRE-002).

## 5. 경계

영역을 건물 밖으로 넓혔으므로 바깥 네 면과 윗면을 엽니다. **바닥(ZMIN)은 열지 않습니다**(VENT-002).

```
set_all_boundaries_open {"faces": ["XMIN", "XMAX", "YMIN", "YMAX", "ZMAX"]}
```

영역이 외벽과 같으면 면을 다 열지 말고 실제 개구부 쪽만 엽니다(VENT-003).

## 6. 출력 — ASET 판정에 필요한 것

```
output_add_tenability_slices {}
add_slcf {"id": "T_Y6", "quantity": "TEMPERATURE", "pby": 6}
set_plot3d_outputs {"quantities": ["VOLUME FRACTION", "VOLUME FRACTION", "VOLUME FRACTION", "TEMPERATURE", "VISIBILITY"], "spec_ids": ["CARBON MONOXIDE", "CARBON DIOXIDE", "OXYGEN"]}
update_dump_config {"dt_slcf": 1, "dt_pl3d": 2, "dt_devc": 1, "dt_hrr": 1, "dt_s3d": 1}
add_smoke_detector {"id": "SD_1F_1", "x": 10, "y": 6, "z": 2.95}
```

- `output_add_tenability_slices` 가 층마다 zMin + 1.8 m 에 온도·가시거리·O₂·CO₂·CO 슬라이스를 넣습니다(OUT-006, ASET-001, ASET-004). `fire_compute_aset` 이 이 슬라이스를 읽습니다.
- Plot3D 5칸은 CO·CO₂·O₂(VOLUME FRACTION 칸을 앞에서부터 연속으로) + 온도 + 가시거리입니다(OUT-004). FED 연계(플레이북 02)에도 같은 자료를 씁니다.
- 출력 주기는 T_END 보다 작아야 합니다(OUT-001). 수량은 GPU 지원 목록 안에서 고릅니다(OUT-002, DEVC-002).
- 감지기는 천장 아래 기체 셀에 둡니다(DEVC-001). 감지 시각은 RSET 계산에 씁니다(ASET-005).

## 7. 해석 설정과 사전 점검

```
set_time {"t_end": 600}
set_simulation_mode {"mode": "LES"}
validate_project {}
sim_preflight {}
preview_fds {"namelist": "VENT"}
```

`sim_preflight` 의 `ok` 가 true 이고 오류가 0 건이 될 때까지 고칩니다(GEN-006, GEN-016). 각 항목에는 규칙 ID 가 붙어 있으니 `bulc_knowledge_search "<id>"` 로 고치는 법을 찾습니다. 구버전 앱은 `validate_project` 만 씁니다.

## 8. 저장과 실행

```
project_save {"path": "D:/work/office_fire_A.bulc"}
sim_start {"confirm": true}
sim_status {}
```

- 저장: `project_save` 로 `office_fire_A.bulc` 에 저장합니다 → CHID 가 `office_fire_A` 가 됩니다(GEN-009, GEN-014). 같은 이름의 파일이 있으면 사용자 확인 뒤에만 `overwrite: true` 를 줍니다.
- 조건 요약(격자·셀 수·화원·T_END·출력·엔진)을 보여 주고 사용자 확인을 받은 뒤에만 `sim_start {"confirm": true}` 를 부릅니다(GEN-016). `sim_start` 는 직전에 점검을 다시 돌려 오류가 있으면 실행하지 않습니다.
- 실행 중에는 `sim_status {}` 로 진행률·nan=0·Tmax ≤ 2500 K·|u| < 50 m/s·HRR 을 봅니다(SIM-007). 엔진 로그는 `sim_log_tail {}` 입니다.
- 시나리오를 바꾸면 다른 이름으로 저장해 실행합니다(GEN-019).
- 구버전 앱: 사용자에게 앱에서 `office_fire_A.bulc` 로 저장하도록 요청하고, `validate_project` → 확인 → `run_simulation {"folder_name": "office_fire_A"}`(이 서버가 실행 직전에 점검을 다시 돌림)으로 실행합니다.

## 9. 결과와 ASET 판정

```
results_detect {}
fire_results_summary {}
fire_timeseries {"file": "hrr", "columns": ["HRR"]}
fire_compute_aset {}
```

- `fire_results_summary` 로 최대 HRR·총 발열량·감지기 작동 시각을, `fire_timeseries` 로 HRR 이 설계 곡선을 따랐는지 확인합니다(TRB-003).
- `fire_compute_aset` 은 기본으로 모든 사용자 출구(OPEN 벤트·문 품목·`Door_` 구멍)의 층 바닥 + 1.8 m 에서 기준(60 °C, 5 m, CO 1,400 ppm, O₂ 15 %, CO₂ 5 %)을 처음 넘는 시각을 냅니다. 출구마다 ASET·지배 기준이 나오고, 끝까지 넘지 않으면 "ASET ≥ T_END"(하한)입니다. 빠진 수량이 있으면 출력을 더해 다시 실행해야 합니다(ASET-004).
- 앱 결과 뷰어의 ASET/RSET 보고서는 Plot3D → 슬라이스 → 장치 CSV 순으로 자료를 찾습니다. 구버전 앱에서는 사용자에게 이 화면을 안내합니다.

## 10. 보고에 넣을 것

- 도면 축척·원점·단순화 내용, 셀 크기와 D*/dx, 화원·수율의 출처와 가정, 판정 기준과 그 출처 판, 엔진 제약(SIM-004, OUT-002 등) 중 해당 항목.
- 결과 수치는 도구가 돌려준 값만 씁니다. 실행하지 않았거나 결과 도구가 "결과가 없습니다"라고 했으면 수치를 쓰지 않습니다(GEN-010).
