# 플레이북 05 — 선박·플랜트 물분무: 배관 ISO 도면 → 구역 → 수원압력 역산 → 펌프 → 설계 검토 → 계산서 내보내기

배관 아이소메트릭(ISO) 도면에서 물분무(일제살수) 배관망을 인식해 구역별 설계 계산을 하고, 필요한 수원 압력과 펌프 사양을 정한 뒤 설계·사양 검토와 계산서(CSV / FHC 형식) 내보내기까지 하는 순서입니다.
고객 도면은 로컬 경로로만 다룹니다(GEN-012). 아래 값은 모두 합성 예제입니다.

## 0. 받을 것

| 항목 | 예시(합성) | 규칙 |
|---|---|---|
| 도면 | ISO 도면 DWG/DXF/PDF 묶음(zip 가능) | DRW-001, DRW-008 |
| 노즐 | 개방형 K80, 요구 방사압 0.2 MPa(노즐 사양서) | SPR-025 |
| 구역 | 라인 번호 → 일제살수 구역 대응표 | SPR-022 |
| 배관 규격 | JIS G3454 STPG370 Sch40(해수) | SPR-005, SPR-006 |
| 밸브·플랜지 등급 | 10K | SPR-054 |
| 설계 밀도·동시 운전 구역 | 협약·선급·선주 사양 | SPR-053(원문 확인) |
| 펌프 조건 | 해수, 흡입 수두, 펌프 → 입구 높이·배관 | SPR-031, SPR-032 |

## 1. 도면 분석

```
spr_analyze_drawing {"filePath": "D:/work/ws_iso_bundle.zip"}
spr_analyze_drawing {"candidateId": "<id>", "show": "runs"}
spr_analyze_drawing {"candidateId": "<id>", "show": "tags"}
```

- ISO 도면은 치수(DIMENSION)로 축척을 잡고, 배관 선종류·곡관·플랜지/밸브 틈 연결·노즐 스템·라인 번호·레듀서·밸브 태그를 읽어 3D(X, Y 수평, Z 위, 입구 = 원점)로 복원합니다.
- 요약의 **열린 끝(드레인 후보)**, **참조선(점선·다른 계통)**, **제외 힌트**, **모호한 항목**을 사용자에게 묻습니다(DRW-006, DRW-007).
- `needsVision` 이면 글자가 윤곽선인 PDF 입니다. 페이지 이미지를 직접 읽어 보완합니다(DRW-008).
- 치수가 없으면 `options.scaleMmPerUnit`, 입구 위치가 애매하면 `options.rootHint`, 라인 번호 형식이 다르면 `options.lineNoPattern` 으로 다시 분석합니다.

## 2. 가져오기

먼저 점검하고(dryRun), 확인한 제외·구역·드레인·밸브를 넣어 가져옵니다.

```
spr_import_network {
  "candidateId": "<id>",
  "mode": "replace",
  "dryRun": true,
  "excludeLines": ["<참조 라인 번호>"],
  "defaults": {"kFactor": 80, "nozzleKind": "open", "requiredPressure": 0.2, "material": "JIS_G3454_STPG_SCH40"},
  "zoneByLine": {"WS-Z1-50A": "Z1", "WS-Z2-50A": "Z2"},
  "drains": [{"node": 17, "orificeDiameterMm": 6}],
  "valves": [{"segment": 4, "type": "butterfly_valve", "tag": "WS-V1", "zone": "Z1"}],
  "source": {"sourceType": "pump", "pumpRatedFlow": 600, "pumpRatedHead": 0.6, "pumpShutoffHead": 0.75},
  "scriptPath": "D:/work/ws_import_payload.json"
}
```

dryRun 결과(노드·관·노즐·드레인 수, 경고)를 확인한 뒤 `"dryRun": false`(또는 생략)로 다시 부릅니다. `scriptPath` 로 저장한 페이로드는 나중에 `network` 로 그대로 다시 가져올 수 있습니다.

### 도면 인식 없이 손으로 쓰는 페이로드(합성 예제 — 검증된 형식)

```
spr_import_network {"mode": "replace", "network": {
  "version": 1, "units": "m",
  "defaults": {"material": "JIS_G3454_STPG_SCH40", "kFactor": 80, "nozzleKind": "open", "requiredPressure": 0.2},
  "nodes": [
    {"ref": "P", "x": 0, "y": 0, "z": 0, "type": "source"},
    {"ref": "R1", "x": 0, "y": 0, "z": 8}, {"ref": "M2", "x": 10, "y": 0, "z": 8}, {"ref": "M3", "x": 20, "y": 0, "z": 8},
    {"ref": "Z1A", "x": 10, "y": 2, "z": 8}, {"ref": "N11", "x": 10, "y": 4, "z": 8}, {"ref": "N12", "x": 10, "y": 6, "z": 8},
    {"ref": "N13", "x": 10, "y": 8, "z": 8}, {"ref": "D1", "x": 10, "y": 9, "z": 7.5},
    {"ref": "Z2A", "x": 20, "y": 2, "z": 8}, {"ref": "N21", "x": 20, "y": 4, "z": 8}, {"ref": "N22", "x": 20, "y": 6, "z": 8}, {"ref": "N23", "x": 20, "y": 8, "z": 8}
  ],
  "pipes": [
    {"from": "P", "to": "R1", "diameter": 100, "lineNo": "WS-MAIN-100A"},
    {"from": "R1", "to": "M2", "diameter": 100, "lineNo": "WS-MAIN-100A"},
    {"from": "M2", "to": "M3", "diameter": 80, "lineNo": "WS-MAIN-80A"},
    {"from": "M2", "to": "Z1A", "diameter": 50, "lineNo": "WS-Z1-50A", "valves": [{"type": "butterfly_valve", "tag": "WS-V1", "zone": "Z1"}]},
    {"from": "Z1A", "to": "N11", "diameter": 50, "lineNo": "WS-Z1-50A"},
    {"from": "N11", "to": "N12", "diameter": 40, "lineNo": "WS-Z1-50A"},
    {"from": "N12", "to": "N13", "diameter": 40, "lineNo": "WS-Z1-50A"},
    {"from": "N13", "to": "D1", "diameter": 25, "lineNo": "WS-Z1-50A"},
    {"from": "M3", "to": "Z2A", "diameter": 50, "lineNo": "WS-Z2-50A", "valves": [{"type": "butterfly_valve", "tag": "WS-V2", "zone": "Z2"}]},
    {"from": "Z2A", "to": "N21", "diameter": 50, "lineNo": "WS-Z2-50A"},
    {"from": "N21", "to": "N22", "diameter": 40, "lineNo": "WS-Z2-50A"},
    {"from": "N22", "to": "N23", "diameter": 40, "lineNo": "WS-Z2-50A"}
  ],
  "heads": [
    {"node": "N11", "zone": "Z1"}, {"node": "N12", "zone": "Z1"}, {"node": "N13", "zone": "Z1"},
    {"node": "D1", "kind": "drain", "orificeDiameterMm": 6, "zone": "Z1"},
    {"node": "N21", "zone": "Z2"}, {"node": "N22", "zone": "Z2"}, {"node": "N23", "zone": "Z2"}
  ],
  "sources": [{"node": "P", "sourceType": "pump", "pumpRatedFlow": 600, "pumpRatedHead": 0.6, "pumpShutoffHead": 0.75}]
}}
```

`pumpRatedHead`·`pumpShutoffHead` 의 단위는 이름과 달리 **MPa** 입니다.

## 3. 노즐·밸브·설계 기준 정리

```
spr_list_summary {}
spr_set_nozzles {"zone": "Z1", "requiredPressure": 0.2}
spr_set_nozzles {"lineNo": "WS-Z2-50A", "setZone": "Z2"}
spr_set_valves {"tag": "WS-V1", "setZone": "Z1"}
spr_set_defaults {"operation": "zone_deluge", "requiredPressureOpen": 0.2, "velocityWarn": 6, "velocityFail": 10}
```

- 노즐 종류: 물분무 노즐은 open, 드레인은 drain(항상 열림, 요구압 없음), 운전 중 닫히는 드레인은 `disabled: true`(SPR-023, SPR-024).
- 노즐 요구압 = 필요 유량에서 역산: P[MPa] = (Q / K)² / 10. 예: 설계 밀도 × 방호 면적 ÷ 노즐 수 = 노즐당 Q(SPR-053).
- 구역 노즐과 구역 밸브를 짝지어 둡니다(SPR-022). 닫힌 밸브는 하류를 고립시킵니다(SPR-008).
- 해수 강관은 C = 100 을 검토합니다(SPR-006): `spr_set_pipes {"all": true, "cFactor": 100}`.

## 4. 설계 계산(구역별 + 수원압력 역산)

```
spr_run_calc {"mode": "design"}
spr_get_results {"detail": "zones", "at": "design"}
spr_get_results {"detail": "lines", "scenario": "zone:Z1", "at": "supply"}
```

- 시나리오는 'all'(참고)과 구역마다 하나입니다. 구역마다 **필요 수원 압력**(모든 참여 노즐이 자기 요구압에 닿는 최소 수원 압력)과 지배 노즐이 나옵니다(SPR-026).
- 'supply' 는 실제 수원 조건(정방향), 'design' 은 역산 설계점입니다.
- 결과표는 라인 번호별로 묶입니다(SPR-021).

## 5. 펌프 사양

```
spr_pump_sizing {"mode": "from_design", "fluid": "sea", "staticLiftM": 2, "suctionHeadM": -3, "pressureMarginPct": 10}
```

- 지배 구역(가장 큰 필요 압력·유량) 기준 정격점, 곡선이 지나야 할 점, NFPA 20 조건(체절 ≤ 140 %, 150 % 유량에서 ≥ 65 %), NFPA 20 표준 용량, 동력·전동기, NPSHa, 바꾸면 어떻게 되나(노즐 K −10 %, 병목 관경 한 단계 ↑, 드레인 닫음) 힌트를 줍니다.
- 해수는 `fluid: "sea"`(SPR-032). 펌프 → 망 입구 배관이 있으면 `pumpPipe {"lengthM": ..., "diameterMm": ...}`.
- 제안 곡선을 쓰려면 `apply: true` 후 `spr_run_calc` 를 다시 돌립니다. 제조사 곡선은 `mode: "check_curve", "curve": [{"flow": ..., "pressure": ...}]` 로 대조합니다(SPR-030).

## 6. 설계·사양 검토

```
spr_design_review {"defaultFlangeClass": "10K"}
spr_design_review {"severity": "warning"}
spr_design_review {"code": "pipe_rating_exceeded"}
```

- 관 압력 등급(규격별 고정값 또는 ASME B31.1 두께 식, 부식 여유), 밸브·플랜지 등급(10K 1.4 MPa 등), 유속, 노즐 요구압 미달·최고압 초과·불균형, 드레인 유량 비율, 닫힌 밸브 고립, 끊긴 망, 관경 역확대, 티 분기 불균형, 손실 큰 밸브, 구역·밸브 짝, 층·입상관, 펌프 곡선을 봅니다(SPR-054).
- 오류는 0 으로 만들고, 남긴 경고는 사유를 적습니다(SPR-040). 합성 예제는 "드레인 1개가 유량의 24 % 를 씀" 경고가 나옵니다 — 상시 개방이면 펌프 유량에 포함하고, 운전 중 닫히면 disabled 로 둡니다.
- 무유량(체절) 압력 + 정수두가 등급 판정에 들어가므로, 체절압이 높은 펌프는 밸브·플랜지 등급을 다시 봅니다.

## 7. 계산서 내보내기와 왕복 확인

```
spr_export_results {"outputDir": "D:/work/ws_out", "format": "both", "language": "en", "projectName": "ws_design", "zip": true}
spr_import_fhc_bundle {"filePath": "D:/work/ws_out/ws_design_Z1_bulc_model.csv", "mode": "check"}
```

- `csv` = 요약·구역·라인·노즐·관 5표(UTF-8 BOM), `fhc` = FHC(Canute) 계산서 모양 CSV(보고서·헤드·관·요약·라인·NFPA 워크시트·노드 맵). `fhcDraft: true` 는 .FHC/.PDT 초안을 함께 씁니다 — FHC 에서 확인 후 씁니다(SPR-041).
- FHC 형식 CSV 는 FHC 프로그램으로 가져오는 파일이 아닙니다. `spr_import_fhc_bundle` 은 BULC 가 내보낸 묶음만 되읽습니다.
- `mode: "check"` 는 아무것도 바꾸지 않고 묶음과 현재 망·재계산 결과를 비교합니다(SPR-042). 합성 예제는 `sameAsCurrentNetwork: true`, 차이 0 입니다.

## 8. (선택) FDS 분무 해석

물분무 노즐의 FDS 분무를 보려면 분무 프로파일을 정하고 `spr_apply_to_fds` 로 넣습니다(플레이북 04 의 5–6단계). 개방형 노즐은 작동 방식을 시간(`activation.mode = "time"`) 또는 제어(`ctrl`)로 줍니다. 물분무 구역의 FDS 해석은 계산량이 크므로 범위를 사용자와 정합니다.

## 9. 보고에 넣을 것

- 도면 인식에서 제외한 라인·세그먼트와 이유, 드레인 처리(상시 개방/닫힘), 구역 대응표.
- 설계 밀도·노즐 요구압의 출처(협약·선급·사양서 판), 해수 C 값, 펌프 여유율.
- 지배 구역·지배 노즐·필요 수원 압력, 펌프 정격과 곡선 조건, 검토 경고의 사유.
