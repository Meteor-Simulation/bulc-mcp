# 플레이북 06 — 문제 해결

증상에서 출발해 확인 도구와 고치는 법을 찾는 표입니다. 규칙 id 는 `rules.yaml` 에 있습니다.
먼저 항상 `validate_project {}` 를 돌리고, 덱 텍스트는 `preview_fds {"namelist": "<그룹>"}` 로 봅니다.

## 1. 도구 호출 단계

| 증상 | 원인 | 확인 | 고치는 법 | 규칙 |
|---|---|---|---|---|
| `Tool input error` / 인자 거절 | 필수 누락, 형식·enum 위반, 오타 키 | 거절 문구의 인자 목록 | 제안된 인자 이름·형식으로 다시 호출 | GEN-005 |
| `Unknown tool` / 알 수 없는 도구 | 목록에 없는 도구, 또는 구버전 앱 | `tools/list`, `bulc_find_tools`, `bulc_connection_status` | 실제 도구로 바꾸고, 그 앱에 없으면 앱 화면 단계로 안내 | GEN-005 |
| `already exists` | ID 중복 | `list_obstacles`, `list_vents`, `list_devices` | 새 ID 또는 `update_*` | GEN-004 |
| 노드 id 를 못 찾음 | 생성 id 를 짐작 | `spr_list_summary`, `hvac_list_summary`, `evac_list_summary` | 요약에서 id 를 읽음 | GEN-008 |
| "디바이스(&DEVC) ID 중복" · HVAC 장애물 ID 가 같음 | label 없이 연달아 만든 헤드·단말(구버전 앱) | `validate_project`, `preview_fds` | 노드마다 겹치지 않는 label → `*_apply_to_fds` 다시 | GEN-021 |
| "BULC 앱에 연결할 수 없습니다" | 앱이 꺼져 있음, 구버전 앱이 다른 포트 사용 | `bulc_connection_status` | 사용자에게 앱 실행 요청, 필요하면 `BULC_BRIDGE_URL` 맞춤 | GEN-018 |
| "BULC 가 아닌 프로그램이 응답합니다" | 다른 프로그램이 같은 포트 사용 | `bulc_connection_status` | 앱을 켜 두면 발견 파일로 찾음. 아니면 앱을 빈 포트로 실행하고 `BULC_BRIDGE_URL` 을 그 주소로 | GEN-018 |
| "브리지 토큰이 필요합니다"(401) | 앱이 `BULC_BRIDGE_AUTH` 로 실행됨 | `bulc_connection_status`(bridge auth) | 서버가 발견 파일을 읽게 하거나 `BULC_BRIDGE_TOKEN` 설정 | GEN-018 |
| sim_start / run_simulation 이 "점검 실패" 로 멈춤 | sim_preflight·validate_project 오류 | `sim_preflight`, `validate_project` | [오류] 를 고친 뒤 다시 실행 | GEN-006, GEN-016 |
| 파일 도구(new_project, save_project 등) Unknown tool | 다른 서버의 이름 | `tools/list` | `project_open`·`project_save`·`project_export_fds`, 구버전 앱은 파일 메뉴 안내 | GEN-014 |
| 가져온 문·창이 빠짐 | `arch_import_building` 의 wall 을 0 부터 셈, 벽에서 너무 멂 | 응답의 `warnings`·`dropped` | wall 은 1 부터, at 은 벽 중심선 가까이 | DRW-004 |

## 2. 덱 점검(validate_project) 오류

| 문구 | 원인 | 고치는 법 | 규칙 |
|---|---|---|---|
| ERROR(314) HRRPUA … &REAC 없음 | 연료 미지정 | `update_reaction {"fuel": "PROPANE"}` | FIRE-003 |
| ERROR(1020) / (1021) PART_ID | 입자 수량에 PART_ID 없음·틀림 | `preview_fds {"namelist": "PART"}` 의 실제 ID 로 `update_device` | DEVC-005 |
| ERROR(938) CTRL_ID | CONTROL 장치가 없는 CTRL 참조 | `add_control` 또는 `update_device` | DEVC-004 |
| INPUT_ID 가 없습니다 | add_control 의 input_id 누락 | `update_control {"id": "...", "input_id": ["SD_1"]}` | DEVC-006 |
| 도메인 각 축은 min < max | XB 순서 | `set_mesh` 다시 | GEN-003 |
| 정의되지 않은 SURF_ID / MATL_ID | 참조 대상 없음 | `add_surface_from_library`, `add_material_from_library` | SURF-001 |
| LOCK_TIME_STEP … DT 없음 | dt 누락 | `set_numerics {"lock_time_step": true, "dt": 0.01}` | SIM-002 |
| 분무 오류(ERROR 238/237/231/214/224/934) | 분무 키 조합 | `spr_upsert_spray_profile`, `spr_set_head_spray` | SPR-012 |

## 3. 덱 점검 경고

| 문구 | 뜻 | 고치는 법 | 규칙 |
|---|---|---|---|
| 화원이 메시 밖에 있습니다 | 화원이 계산에서 빠짐 | 메시 확장 또는 화원 이동 | GEO-006 |
| 장애물·디바이스가 도메인 밖 | 계산에서 빠짐 | 같음 | GEO-006 |
| OPEN 경계가 하나도 없습니다 | 밀폐 → 산소 고갈 | 실제 개구부 쪽만 OPEN | VENT-001 |
| 출력 주기가 T_END 이상 | t=0 한 장만 저장 | `update_dump_config` | OUT-001 |
| 셀이 정육면체에서 많이 벗어남 | 셀 비 > 2 | IJK 재계산 | MESH-003 |
| 화원 표시는 있지만 타는 면이 없음 | 프리셋 없는 is_fire_source | `set_fds_properties` 또는 `add_fire` | FIRE-011 |
| SLCF 출력이 없습니다 | 볼 단면 없음 | `add_slcf` | OUT-008 |

## 4. 실행·결과 단계

| 증상 | 의심 원인 | 확인 | 규칙 |
|---|---|---|---|
| 결과가 20 °C 초기 상태만 보임 | 출력 주기 ≥ T_END, 화원 미연소 | `get_simulation_settings`, `validate_project` | TRB-001 |
| 불이 안 남 | 메시 밖, 바닥 OPEN 이 화원 덮음, 프리셋 없음, REAC 없음, 성장 느림, 밀폐 | `list_vents`(OPEN_ZMIN), `preview_fds` | TRB-002, VENT-002 |
| HRR 이 설계보다 낮음 | 산소 부족, 면적 격자 축소, 램프, 물 효과 | `<CHID>_hrr.csv`, 개구부 | TRB-003, FIRE-001 |
| 처음부터 최대 HRR | 장애물 화원 ramp_id 누락 | `preview_fds {"namelist": "SURF"}` 의 RAMP_Q | FIRE-014 |
| 화원이 엉뚱한 면에서 탐 | fire_faces 를 문자열로 줌 | `preview_fds {"namelist": "OBST"}` 의 SURF_ID6 | FIRE-013 |
| NaN, 최대 속도 > 50 m/s, Tmax > 2500 K | 작은 면 과대 HRRPUA, 좁은 틈, 과대 급배기 유속, 밀폐 | `sim_status`, `sim_log_tail`, `get_simulation_metrics` | SIM-003, HVAC-004 |
| fire_compute_aset 이 수량 '자료 없음' | 1.8 m 판정 슬라이스·Plot3D 없음 | `results_detect` | ASET-004 |
| evac_get_results 가 예전 결과 | 실행이 끝나기 전에 읽음 | `evac_status` | EVAC-004 |
| 시작 전 "VRAM 부족" | 셀 수 과다, 다중 메시의 큰 빈 공간 | `list_meshes`, `bulc_mesh_advisor` | MESH-006, MESH-007 |
| 메시가 생각보다 성김 | 조건을 어긴 다중 메시를 엔진이 조정 | 실행 로그 경고 | MESH-005, MESH-006 |
| 슬라이스 수량이 전부 온도처럼 보임 | GPU 미지원 SLCF 수량 → TEMPERATURE 대체 | 실행 로그 경고 | OUT-002 |
| 장치 열이 0 | GPU 미지원 DEVC 수량 | 실행 로그 'unsupported' | DEVC-002 |
| 종 슬라이스가 0 또는 연료값 | 지원 밖 SPEC_ID | `list_slcf` | OUT-003 |
| 감지기·헤드가 작동 안 함 | 고체 셀 안, 작동 온도·RTI 과대, T_END 짧음, 컷셀 엔진 | `list_devices`, 헤드 근처 TEMPERATURE 장치 | TRB-004, DEVC-001, SIM-009 |
| 스프링클러가 열려도 HRR 그대로 | 정해진 HRRPUA 화원 | E_COEFFICIENT 유무 | SPR-018 |
| 결과가 자동으로 안 열림 | CHID ≠ 파일 이름 | 결과 폴더의 .smv 이름 | TRB-005, GEN-009 |
| CPU FDS 가 ERROR(101) 로 멈춤 | GPU 전용·6.10.1 비표준 키 | `preview_fds` | SIM-010, VENT-005, FIRE-009 |
| CPU FDS 가 ERROR(1042) 로 멈춤 | 비표준 수량 이름 | `list_devices`, `list_bndf` | DEVC-003 |

## 5. 모듈별

### 피난(EVAC)

| 증상 | 원인 | 규칙 |
|---|---|---|
| 피난자가 한 층 위·아래에 있음 | floorIndex 에 층 id 를 넣음 | EVAC-001 |
| 출구가 영역 양끝 임시 출구로 잡힘 | 출구 객체 없음 | EVAC-002 |
| RSET 이 비현실적으로 짧음 | 실내 `Door_`·`Window_` HOLE 이 출구로 잡힘 | EVAC-003 |
| evac_run 이 "사용자 정의 출구가 없습니다" | 출구 객체 없음 | EVAC-002 |
| 실내 통행이 막힘 | 접두어 없는 HOLE 은 피난 계산에서 벽 | EVAC-003 |
| 피난자가 벽 속에 있음 | 일괄 배치가 장애물을 피하지 않음 | EVAC-005 |
| FED 위험장을 못 만듦 | 3D 자료 없음 | EVAC-008, OUT-004 |
| 피난자가 연기 속에서 멈춤 | FED 판정에 가시거리 켬 | ASET-003 |

### HVAC

| 증상 | 원인 | 규칙 |
|---|---|---|
| 풍량이 1.7배 | m³/h 를 CFM 자리에 넣음 | HVAC-001 |
| 단말 유량 0 | 단말 풍량 없음, 계산 안 함 | HVAC-003 |
| 단말 유속 수십 m/s | 기본 0.2 m 단말 | HVAC-004 |
| 고친 단말 크기가 사라짐 | hvac_apply_to_fds 재실행 | HVAC-004 |
| 단말이 덱에 없음 | 천장 슬래브·영역 밖, 셀보다 작음 | HVAC-002, GEO-003 |

### 스프링클러·물분무

| 증상 | 원인 | 규칙 |
|---|---|---|
| no_source / source_no_data | 수원 노드·데이터 없음 | SPR-001 |
| disconnected / coincident_nodes | 끊긴 망, 겹친 노드 | SPR-002 |
| not_converged / supply_insufficient | 수원 부족, 관경 작음 | SPR-003 |
| velocity_fail | 관경 작음(자동 배치 기본 관경) | SPR-016 |
| pipe_rating_exceeded / valve_rating_exceeded | 압력 등급 부족(체절압 포함) | SPR-054 |
| nozzle_below_required | 요구압 미달 | SPR-003, SPR-025 |
| drains_open | 드레인이 유량을 빼앗음 | SPR-023 |
| valve_closed_isolates | 닫힌 밸브 | SPR-008 |
| zone_mode_no_zones / unzoned_heads | 구역 미지정 | SPR-022 |
| riser_slanted | 층간 비스듬한 관 | SPR-009 |
| k_unusual / required_suspect | 단위 혼동(US K, bar↔MPa) | SPR-010, SPR-011 |
| 펌프가 과대 | 폐쇄형 헤드 전부 개방 계산 | SPR-017 |
| 배관망이 두 벌 | 같은 도면 append 두 번 | DRW-009 |
| FDS 헤드가 두 벌 | spr_apply_to_fds + add_sprinkler | SPR-020 |

## 6. 그래도 안 될 때

1. 작은 합성 모델(한 실, 한 화원)로 같은 증상이 나는지 확인합니다.
2. `preview_fds` 로 해당 namelist 를 그대로 사용자에게 보여 주고, 실행 로그의 경고 줄을 받습니다.
3. 엔진 제약(SIM-004, SIM-005, SURF-002, HVAC-005, OUT-002, DEVC-002)에 해당하면 CPU FDS(`set_run_options {"solver_type": "cpu_openmp"}`) 대조를 사용자와 검토합니다.
4. 확인하지 못한 원인은 추정이라고 밝힙니다.
