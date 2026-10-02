# 플레이북 03 — HVAC 제연(배출·급기) 모델링

거실 제연·급기를 BULC HVAC 모듈로 설계하고 FDS 해석에 단말 경계 유량으로 넣는 순서입니다.
BULC HVAC 모듈은 덕트망 풍량을 계산하고, FDS 에는 **단말(배기 그릴·급기 디퓨저)만** 장애물 아랫면의 유속 경계로 들어갑니다. 덕트 내부 유동·팬 곡선은 FDS 로 보내지 않습니다.
예시는 합성 예제(2층 사무소, 1층 배출 5,000 m³/h)입니다.

## 0. 풍량 정하기

1. 설계 풍량을 사용자·설계 기준에서 받습니다. 국내 제연 기준의 대표값은 ASET-006(원문 확인 필요)에 있습니다.
2. 단위를 CFM 으로 바꿉니다(HVAC-001).
   - CFM = m³/h × 0.5886 = m³/min × 35.31 = m³/s × 2118.9
   - 예: 5,000 m³/h = 2,943 CFM
3. 배출만 두면 실내가 음압이 되어 보충 공기가 필요합니다. 외기와 통하는 개구부(OPEN 경계·출입문)나 급기 디퓨저로 보충 경로를 만듭니다.

## 1. 기본값과 노드

```
hvac_set_defaults {"ductShape": "rectangular", "width": 600, "height": 400, "material": "galvanized_steel"}
hvac_add_node {"x": 10, "y": 6, "z": 2.85, "type": "exhaust_grille", "floorIndex": 0, "label": "EXH_1F"}
hvac_add_node {"x": 10, "y": 11, "z": 2.85, "type": "fan", "floorIndex": 0, "label": "FAN_1"}
hvac_list_summary {}
```

- floorIndex 는 0부터의 층 순번입니다(EVAC-001).
- 단말 노드 z 는 천장 아랫면보다 0.1 m 이상 아래(기체 셀)입니다. 기본 z=3.0 은 천장 슬래브 안에 들어갈 수 있습니다(HVAC-002).
- 노드 id 는 `hvac_list_summary` 응답에서 읽습니다(GEN-008).

## 2. 덕트·단말·송풍기

```
hvac_add_duct {"startNodeId": "<EXH_1F id>", "endNodeId": "<FAN_1 id>", "ductShape": "rectangular", "width": 600, "height": 400}
hvac_add_exhaust_grille {"nodeId": "<EXH_1F id>", "airflowCFM": 2943, "grilleType": "louvered"}
hvac_add_air_handler {"nodeId": "<FAN_1 id>", "maxAirflowCFM": 3000, "staticPressurePa": 500, "fanType": "exhaust"}
```

급기가 필요하면 `hvac_add_node(type="supply_diffuser")` → `hvac_add_supply_diffuser {"nodeId": "...", "airflowCFM": ..., "supplyTempC": 20}`.
GPU 엔진은 급기 온도를 유입 공기에 반영하지 않습니다(HVAC-005).

## 3. 풍량 계산

```
hvac_run_calc {}
hvac_get_results {}
```

- 총 배기·급기 풍량, 덕트 유속 범위, 단말 풍량을 확인합니다. 덕트 유속은 설계 기준 상한(예: 배출기 흡입측 풍도 15 m/s — 원문 확인)과 비교합니다.
- 덕트를 바꾸면 다시 `hvac_run_calc` 합니다(LLM-010).

## 4. FDS 에 반영하고 단말 크기 맞추기

```
hvac_apply_to_fds {}
get_object_properties {"id": "EXH_1F"}
update_obstacle {"id": "EXH_1F", "xb": [9.7, 10.3, 5.7, 6.3, 2.8, 3.0]}
preview_fds {"namelist": "SURF"}
```

- `hvac_apply_to_fds` 는 단말마다 0.2 m 정육면체 장애물(아랫면 0.04 m²)을 만들고 유량 ÷ 면적을 유속으로 씁니다. 그대로 두면 1.39 m³/s 가 약 35 m/s 제트가 됩니다(HVAC-004).
- 실제 그릴 크기로 키우면 유속이 다시 계산됩니다. 합성 예제의 0.6 m × 0.6 m 면은 `VEL=3.86` 이 됩니다.
- 단말 장애물은 천장 슬래브 아랫면에 붙이고 아랫면이 실내를 향하게 합니다. 셀 크기보다 작으면 격자에 맞춰 사라질 수 있습니다(GEO-003).
- `hvac_apply_to_fds` 를 다시 부르면 단말이 새로 만들어져 손으로 고친 크기·램프가 사라집니다. 그 뒤에 다시 고칩니다.

## 5. 기동 시각

제연은 감지 뒤에 기동합니다. 단말 램프로 기동 시각을 줍니다(HVAC-006).

```
set_fds_properties {"id": "EXH_1F", "fds_override": {"ramp_up_mode": "custom", "ramp_up_points": [[0, 0], [60, 0], [75, 1]]}}
preview_fds {"namelist": "RAMP"}
```

- 위 예는 60 s 까지 정지, 75 s 에 전량입니다. 기동 시각은 감지기 작동 시각 + 연동 지연으로 정하고 근거를 적습니다.
- 감지기 작동 시각을 모르면 먼저 제연 없이 한 번 해석해 감지 시각을 얻는 방법도 있습니다.

## 6. 확인용 계측

```
add_device {"id": "EXH_FLOW", "quantity": "VOLUME FLOW", "xb": [9.7, 10.3, 5.7, 6.3, 2.75, 2.75]}
add_device {"id": "LAYER_1F", "quantity": "LAYER HEIGHT", "xb": [5, 5, 6, 6, 0, 3.0]}
add_slcf {"id": "VEL_Y6", "quantity": "VELOCITY", "pby": 6, "vector": true}
validate_project {}
```

- `VOLUME FLOW` 평면 장치로 실제 배출량이 설계값과 맞는지, `LAYER HEIGHT` 로 연기층 높이를 봅니다(GPU 지원 수량, DEVC-002).
- 실행 중 |u| 가 50 m/s 를 넘으면 단말 면적·풍량을 다시 봅니다(SIM-003).

## 7. 비교 해석

제연 효과는 같은 화재로 "제연 없음 / 있음" 두 해석을 비교해 보여 줍니다. 프로젝트를 다른 이름으로 저장해 두 CHID 를 만듭니다(GEN-009). ASET 판정은 플레이북 01 의 10단계와 같습니다.

## 8. 제약 요약

| 항목 | 내용 | 규칙 |
|---|---|---|
| 풍량 단위 | CFM | HVAC-001 |
| 단말 위치 | 천장 아래 기체 셀 | HVAC-002 |
| 유량 0 단말 | 단말 풍량 또는 계산 결과 필요 | HVAC-003 |
| 단말 크기 | 기본 0.04 m² → 과대 유속 | HVAC-004 |
| 급기 온도 | GPU 엔진 미반영 | HVAC-005 |
| 기동 시각 | 램프로 지정 | HVAC-006 |
| FDS &HVAC 덕트망 | GPU 엔진 일부 미지원 | SIM-008 |
