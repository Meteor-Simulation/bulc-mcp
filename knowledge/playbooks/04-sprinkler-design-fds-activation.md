# 플레이북 04 — 스프링클러 설계(평면) → 수리계산 → FDS 작동 해석

건물 스프링클러 배관망을 만들고(도면 인식·자동 배치·직접 입력), 수리계산과 설계·사양 검토를 통과시킨 뒤, 계산된 헤드 유량으로 FDS 해석에 넣어 작동 시각과 효과를 보는 순서입니다.
예시는 합성 예제(1층 사무실 20 m × 12 m, 천장 3.0 m)입니다.

## 0. 받을 것

| 항목 | 예시(합성) | 규칙 |
|---|---|---|
| 도면 | 스프링클러 평면도 DXF 또는 건축 평면 | DRW-001 |
| 헤드 | 표준 하향형 K80, 68 °C, RTI 50(조기반응) | SPR-010 |
| 설계 개방 헤드 수·설계면적 | 사용자·설계 기준 | SPR-017 |
| 수원 | 시수 정압·잔압·잔압 유량 또는 펌프 곡선 | SPR-001 |
| 관 규격 | KS D 3507 / 압력배관용 KS D 3562 Sch40 등 | SPR-005 |

단위: 배관망 압력 MPa, 유량 L/min, 관경 mm, K 는 L/(min·bar^½). FDS 헤드 압력은 bar 입니다(SPR-011).

## 1. 배관망 만들기 — 세 가지 경로

### 1-A. 스프링클러 평면도에서 인식

```
spr_analyze_drawing {"filePath": "D:/work/spr_plan_1F.dxf", "options": {"projection": "plan", "planHeightM": 2.9}}
```

- 요약의 레이어·헤드 블록 후보, 모호한 항목(ambiguities)을 사용자에게 확인하고, 필요하면 `options.pipeLayers`, `options.headBlocks`, `options.headLayers`, `options.scaleMmPerUnit` 으로 다시 분석합니다(DRW-006).
- 먼저 `dryRun` 으로 점검하고 가져옵니다. 다시 가져올 때는 `mode: "replace"`(DRW-009).

```
spr_import_network {"candidateId": "<분석 결과 id>", "defaults": {"kFactor": 80, "nozzleKind": "closed", "material": "KSD3507"}, "placement": {"x": 0, "y": 0, "z": 2.9}, "dryRun": true}
spr_import_network {"candidateId": "<분석 결과 id>", "defaults": {"kFactor": 80, "nozzleKind": "closed", "material": "KSD3507"}, "placement": {"x": 0, "y": 0, "z": 2.9}}
```

### 1-B. 사각형 영역 자동 배치

헤드 간격은 수평거리 r 의 √2 배 이하입니다(SPR-051, 원문 확인). floorIndex 는 **층 id**(1F = 1)입니다(EVAC-001).

```
spr_auto_layout {"xMin": 0.2, "xMax": 19.8, "yMin": 0.2, "yMax": 11.8, "z": 2.9, "spacingX": 3.2, "spacingY": 3.2, "floorIndex": 1}
```

자동 배치는 연결만 하고 관경·수원을 설계하지 않습니다(SPR-016). 3단계에서 반드시 고칩니다.

### 1-C. 직접 입력

노드를 만들고 id 를 읽은 뒤 관으로 잇습니다(GEN-008). 많으면 손으로 쓴 `spr_import_network {"network": {...}}` 가 빠릅니다(플레이북 05 의 예).

```
spr_add_node {"x": 0.2, "y": 0.2, "z": 2.9, "type": "source", "label": "WS"}
spr_add_node {"x": 1.8, "y": 1.8, "z": 2.9, "type": "sprinkler", "label": "SPR-1"}
spr_list_summary {}
spr_add_pipe {"startNodeId": "<WS id>", "endNodeId": "<SPR-1 id>", "diameter": 32, "material": "KSD3507"}
spr_add_sprinkler_head {"nodeId": "<SPR-1 id>", "kFactor": 80, "activationTemp": 68, "rti": 50}
```

층간 배관은 `spr_add_riser` 로 정확히 수직으로 만듭니다(SPR-009).

## 2. 수원과 설계 기준

```
spr_list_summary {}
spr_update_water_source {"id": "<수원 id>", "sourceType": "city_water", "staticPressure": 0.55, "residualPressure": 0.35, "residualFlow": 1500}
spr_set_defaults {"requiredPressureClosed": 0.1, "velocityWarn": 6, "velocityFail": 10, "includeClosedHeads": true}
```

- 설계 개방 헤드 수로 계산하려면 수리적으로 가장 먼 헤드들을 한 구역으로 묶습니다(SPR-017).

```
spr_set_nozzles {"nodeIds": ["<먼 헤드 노드 id들>"], "setZone": "DA"}
spr_set_defaults {"operation": "zone_deluge"}
```

## 3. 계산 → 검토 → 수정 반복

```
spr_run_calc {"mode": "design"}
spr_get_results {"detail": "nozzles", "at": "design"}
spr_design_review {}
```

검토 결과의 대표 코드와 고치는 법:

| code | 뜻 | 고치는 도구 |
|---|---|---|
| velocity_fail / velocity_warn | 유속 10 / 6 m/s 초과 | `spr_update_pipe {"id": "...", "diameter": 40}` |
| pipe_rating_exceeded | 관 압력 등급 초과 | `spr_set_pipes {"pipeIds": [...], "material": "KS_D3562_SPPS_SCH40"}` |
| nozzle_below_required | 요구압 미달 | 관경 확대, 수원 조정, 펌프(4단계) |
| disconnected / orphan_node | 끊긴 망 | `spr_add_pipe`, `spr_remove_node` |
| valve_closed_isolates | 닫힌 밸브가 헤드 고립 | `spr_set_valves` |

고칠 때마다 `spr_run_calc` 를 다시 돌립니다(SPR-004). 오류가 0 이 될 때까지 반복합니다(SPR-040).

## 4. 펌프(필요할 때)

```
spr_pump_sizing {"mode": "from_design", "pressureMarginPct": 10}
```

- 정격 유량·압력, 곡선이 지나야 할 점, NFPA 20 곡선 조건(체절 ≤ 140 %, 150 % 유량에서 ≥ 65 %), 전동기 kW, NPSHa 를 줍니다(SPR-030, SPR-031).
- 제안을 망에 넣으려면 `apply: true` 로 다시 부르고 `spr_run_calc` 를 돌립니다. 제조사 곡선이 있으면 `mode: "check_curve"` 로 대조합니다.

## 5. 분무 특성

```
spr_list_summary {"include_presets": true}
spr_upsert_spray_profile {"name": "QR K80", "preset": "qr_pendant_k80"}
spr_set_head_spray {"all": true, "profile_id": "<프로파일 id>"}
```

- 프리셋에서 시작합니다(SPR-014). 유량 키 조합 규칙을 어기면 도구가 적용 전에 거절합니다(SPR-012).
- 상향형도 아래로 분사합니다(SPR-015).

## 6. FDS 에 반영

```
spr_apply_to_fds {}
list_devices {}
preview_fds {"namelist": "PROP"}
add_device {"id": "N_ACT", "quantity": "ACTUATED SPRINKLERS", "xyz": [10, 6, 1.5]}
add_device {"id": "T_HEAD_NEAR", "quantity": "TEMPERATURE", "xyz": [11.4, 5.0, 2.9]}
validate_project {}
```

- 배관망 헤드는 이 한 경로로만 FDS 에 넣습니다. `add_sprinkler` 로 같은 자리에 또 만들지 않습니다(SPR-020).
- 헤드는 천장 아래 기체 셀에 있어야 작동합니다(DEVC-001). 합성 예제는 천장 3.0 m, 셀 0.2 m, 헤드 z = 2.9 m 입니다.
- 화원은 플레이북 01 의 5단계로 만들고, 작동 예상 시각 이후까지 T_END 를 둡니다(FIRE-005).
- 물로 HRR 이 줄어드는 효과를 보려면 화원 면에 E_COEFFICIENT 가 필요합니다(SPR-018). 근거가 없으면 "작동 후 HRR 고정" 같은 설계 화재를 사용자와 정해 램프로 표현합니다.
- 물방울 출력이 필요하면 `set_numerics {"particle_global": {"dt_part": 1}}` 를 검토합니다.

## 7. 결과와 보고

- 작동 시각: `<CHID>_devc.csv` 의 `N_ACT` 열, 헤드 근처 온도.
- 계산서: `spr_export_results {"outputDir": "D:/work/spr_out", "format": "csv"}` (요약·구역·라인·노즐·관 5표).
- 보고에는 설계 기준(요구압, 유속 한계, 설계 개방 헤드 수와 방식), 수원 조건, 검토에서 남긴 경고와 사유, 엔진 제약(예: 베타 컷셀 엔진으로 실행한 경우, SIM-009)을 적습니다.

## 8. 흔한 실수

| 실수 | 규칙 |
|---|---|
| US K 값을 그대로 입력 | SPR-010 |
| MPa 와 bar 혼동 | SPR-011 |
| 자동 배치 결과를 관경 조정 없이 보고 | SPR-016 |
| 폐쇄형 헤드 전부 개방으로 펌프 산정 | SPR-017 |
| 고친 뒤 재계산 없이 FDS 반영 | SPR-004 |
| 헤드를 천장 슬래브 높이에 둠 | DEVC-001 |
| 배관망 헤드를 add_sprinkler 로 중복 생성 | SPR-020 |
