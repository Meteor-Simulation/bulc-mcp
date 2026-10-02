# 플레이북 02 — 피난(EVAC) + FED 화재 연계 → RSET

플레이북 01 의 건물·화재 모델 위에 피난자·계단·경로를 넣고, 화재 결과를 피난 계산에 연계(FED)해 피난 소요 시간(RSET)을 구한 뒤 ASET 과 비교하는 순서입니다.
BULC 0.89 이상을 기준으로 쓰고, 그 이전 앱의 대안을 함께 적었습니다. 예시는 합성 예제(2층 사무소)입니다.

## 0. 먼저 알아 둘 제약

- MCP 도구로 할 수 있는 일: 피난자 배치, 계단, 경유점, 여정(경로), 피난 설정(모델·시간·dt), 요약 조회, **피난 실행(`evac_run`)·상태(`evac_status`)·결과 요약(`evac_get_results`)**.
- **앱 화면에서 사용자가 하는 일**: FED 연계 켜기와 화재 결과 연결, 경보 연동(EVAC-004). 이 설정 도구는 없으므로 도구로 했다고 말하지 않습니다(GEN-010). 사용자가 켜 둔 설정은 `evac_run` 입력에 그대로 들어갑니다.
- 0.88 이하 앱에는 `evac_run`·`evac_status`·`evac_get_results` 가 없습니다. 그때는 피난 실행과 결과 보기도 앱 화면에서 사용자가 합니다.
- 피난 도구의 floorIndex 는 **0부터의 층 순번**입니다(1F = 0, 2F = 1). 배관망·층 편집 도구의 층 id(1F = 1)와 다릅니다(EVAC-001).
- 출구를 만드는 도구는 없습니다. 출구는 피난 입력을 조립할 때 자동으로 정해집니다(EVAC-002).
  - 그 층 높이와 겹치는 OPEN 벤트, 문 품목, ID 가 `Door_` 또는 `Window_` 로 시작하는 HOLE.
  - `Door_`·`Window_` HOLE 은 **실내 문이라도 모두 출구**가 됩니다. 피난자는 가장 가까운 출구로 갑니다(EVAC-003). `arch_import_building` 이 만든 창(`Win_…`)은 출구가 아닙니다.

## 1. 모델 점검 — 출구와 통로

```
project_info {}
draw_list_stories {}
list_obstacles {}
list_vents {}
```

- `project_info` 의 `counts.exitHoles`·`openVents` 로 출구 후보 수를 봅니다.
- 최종 출구(외부·피난 계단 출입문)가 `Door_` HOLE 로 있는지 봅니다. 없으면 `add_door {"id": "Door_EXIT_2", "wall_id": "W1_N", "position": 0.8, "width": 1.2, "height": 2.1}`.
- 창이 `Window_` 로 시작하면 출구로 잡힙니다(앱 2D 편집기로 그린 창). 출구가 아닌 창은 `Win_` 같은 다른 접두어를 씁니다.
- 실내 문을 지나야 하는 평면이면 이 제약을 사용자에게 알리고, 앱의 피난 실행 창에서 출구 목록을 확인하게 합니다.

## 2. 피난자 배치

실(room)마다 벽에서 0.3 m 이상 안쪽 사각형으로 나눠 배치합니다. 이 도구는 장애물을 피하지 않습니다(EVAC-005). 재실자 수는 사용자·설계 기준(수용 인원 산정)에서 받습니다(GEN-011).

```
evac_add_agents_batch {"xMin": 1, "xMax": 8, "yMin": 1, "yMax": 11, "count": 40, "floorIndex": 0}
evac_add_agents_batch {"xMin": 1, "xMax": 15, "yMin": 1, "yMax": 11, "count": 60, "floorIndex": 1}
```

- 밀도는 바닥 1 m² 당 2명 이하로 둡니다.
- 보행 속도 기본값은 desiredSpeed 1.2 m/s, maxSpeed 1.8 m/s 입니다. 노약자 비율 등은 `evac_update_agent` 로 개별 조정합니다.
- 가구가 많은 실은 앱의 피난자 배치 대화상자(장애물 회피)를 권합니다.

## 3. 계단

위층 → 아래층 방향으로, 계단 평면의 시작·끝점을 줍니다(EVAC-006). 계단 위치의 슬래브는 HOLE 로 뚫려 있어야 연기도 같은 경로로 퍼집니다(GEO-008).

```
evac_add_stair {"fromFloorIndex": 1, "toFloorIndex": 0, "x1": 17.2, "y1": 9.2, "x2": 19.4, "y2": 11.4, "widthCm": 120, "capacity": 20}
```

## 4. 경로(선택)

특정 경로로 유도할 때만 씁니다. 경유점 id 는 요약에서 읽습니다(GEN-008). 계단은 여정 단계가 아닙니다.

```
evac_add_waypoint {"x": 10, "y": 2, "floorIndex": 0, "radius": 1.0}
evac_list_summary {}
evac_add_journey {"name": "south_exit", "stages": [{"type": "WAYPOINT", "targetId": "<경유점 id>"}, {"type": "EXIT"}]}
```

## 5. 피난 설정과 확인

```
evac_update_setup {"model": "CollisionFreeSpeed", "simulationTime": 600, "timeStep": 0.05}
evac_list_summary {}
validate_project {}
```

`evac_list_summary` 로 층별 피난자 수, 계단, 여정을 확인합니다. 화재 해석과 같은 프로젝트로 저장합니다: `project_save {}`(이미 저장된 파일이면 그 파일에, 처음이면 `{"path": "D:/work/office_fire_A.bulc"}`). 구버전 앱은 사용자에게 앱에서 저장하도록 요청합니다(GEN-014).

## 6. 화재 결과 준비 — FED 연계에 필요한 자료

FED 위험장은 3D 화재 자료(Smoke3D 그을음·3D 슬라이스·Plot3D)의 호흡선 높이(기본 1.8 m) 평면에서 온도·소광계수·CO·CO₂·O₂ 를 뽑습니다(EVAC-008). 플레이북 01 의 다음 설정이 있어야 합니다.

```
set_plot3d_outputs {"quantities": ["VOLUME FRACTION", "VOLUME FRACTION", "VOLUME FRACTION", "TEMPERATURE", "VISIBILITY"], "spec_ids": ["CARBON MONOXIDE", "CARBON DIOXIDE", "OXYGEN"]}
update_dump_config {"dt_pl3d": 2, "dt_s3d": 1}
```

화재 해석이 끝나 있어야 합니다: `sim_status {}` 가 끝났다고 하고 `results_detect {}` 가 .smv 와 Plot3D 를 보여 주는지 확인합니다.

## 7. 앱에서 할 일(사용자 안내) — FED 연계·경보

사용자에게 다음 순서를 안내합니다.

1. EVAC 탭 → 피난 설정에서 **FED 연계**를 켜고 화재 결과(.smv)를 고릅니다. 호흡선 높이 1.8 m, 프레임 간격 2 s, FED 기준 1.0 이 기본값입니다.
2. 판정 항목: 앱 기본은 FED 1.0·온도 60 °C·CO 1,400 ppm 을 켜고, 가시거리 5 m·O₂ 15 %·CO₂ 5 % 는 끕니다. 가시거리는 무력화 기준이 아니므로 켜지 않습니다(ASET-003).
3. **경보 연동**: 감지기 작동 시각 + 경보 지연 + 피난 개시 소요로 피난 개시 시각을 정합니다.

## 8. 피난 실행과 결과

피난자 수·출구·FED 연계 여부·시뮬레이션 시간을 요약해 사용자 동의를 받은 뒤 실행합니다.

```
evac_run {"confirm": true}
evac_status {}
evac_get_results {}
evac_get_results {"detail": "exits"}
```

- `evac_run` 은 피난자가 없거나 사용자 정의 출구가 없으면 거절합니다. `allowNoExits: true` 는 영역 가장자리 임시 출구로 계산하므로 사용자가 알고 받아들일 때만 씁니다(EVAC-002).
- `evac_status` 가 끝났다고 할 때까지 기다린 뒤 `evac_get_results` 를 읽습니다. 그 전에 읽으면 이전 결과(또는 결과 없음)입니다(EVAC-004).
- `evac_get_results` 는 피난 완료·잔류 인원, 마지막 탈출 시각(앱 RSET 표시값), 평균·p50/p90/p95 탈출 시각, 경보 연동에 따른 피난 개시 지연, FED 사상자와 원인, 출구별 인원·처음/마지막 시각·유량을 돌려줍니다.
- 구버전 앱: 사용자에게 EVAC 탭에서 피난을 실행하고 결과 창에서 출구별 통계·마지막 피난 완료 시각·FED 초과 인원을 확인하도록 안내합니다.

## 9. RSET 과 판정

- RSET = 감지 + 경보 + 피난 개시 지연 + 이동(피난 계산) + 안전율(ASET-005).
  - 감지 시각: `fire_results_summary {}` 의 감지기 작동 시각(또는 경보 연동 결과).
  - 이동: `evac_get_results` 의 마지막 탈출 시각(또는 설계 기준이 정한 백분위).
  - 개시 지연·안전율: 용도·기준 문헌 값을 근거와 함께 씁니다. 앱 보고서 기본값(감지 30 s, 경보 3 s, 개시 지연 60 s, 이동 120 s, 안전율 15 %)은 자리 표시 값입니다.
- 판정: 출구마다 `fire_compute_aset {}` 의 ASET > RSET. 결과 뷰어의 ASET/RSET 보고서도 두 값을 함께 보여 줍니다.
- FED 연계 결과에서 FED ≥ 1.0 인 피난자가 있으면 그 수·원인을 보고합니다.

## 10. 흔한 실수

| 실수 | 결과 | 규칙 |
|---|---|---|
| floorIndex 에 층 id(1부터)를 넣음 | 피난자가 한 층 위에 놓임 | EVAC-001 |
| 창을 `Window_` 로 만듦 | 창이 출구가 됨 | EVAC-003 |
| 벽·가구를 덮는 큰 사각형에 일괄 배치 | 피난자가 벽 속에 놓임 | EVAC-005 |
| 2D 슬라이스만 저장 | FED 위험장을 못 만듦 | EVAC-008 |
| FED 판정에 가시거리 5 m 를 켬 | 연기 속 피난자가 멈춤 | ASET-003 |
| `evac_run` 직후 `evac_get_results` 를 읽음 | 이전 결과를 보고 | EVAC-004 |
| FED 연계·경보를 도구로 켰다고 보고 | 거짓 보고(설정 도구가 없음) | GEN-010 |
