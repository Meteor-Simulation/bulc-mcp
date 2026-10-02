# 예시 세션 2 — 물분무 배관 ISO 도면 → 구역 설계 → 펌프 → 검토 (합성)

모든 값과 파일은 합성 예제입니다. 노즐 K·요구압·라인 번호는 설명용으로 지어낸 값이며 실제 프로젝트와 관계가 없습니다.

**사용자**: `D:\work\water-spray-iso-synthetic.dxf` 물분무 계통 구역별로 계산하고 펌프 사양까지 봐 줘.

```
bulc_drawing_intake {"path": "D:\\work\\water-spray-iso-synthetic.dxf", "purpose": "water_spray"}
→ kind: piping_isometric (confidence high)
  - DXF AC1009 · units millimetre
  - layers: WS-PIPE(9), WS-NOZZLE(6), WS-TEXT(4), WS-VALVE(2)
  - line angles: 11 % orthogonal, 89 % on 30°/150° isometric axes
  playbook: bulc://knowledge/playbooks/05-marine-water-spray-iso
  ask the user: 노즐 K 와 요구 방사압(MPa)…, 라인 번호 ↔ 구역 대응표…, 해수입니까?
```

**어시스턴트**: 사양서 기준 노즐 K 와 요구 방사압, 라인 번호별 구역, 해수 여부를 알려 주세요. 값이 없으면 계산하지 않고 기다립니다(GEN-011, SPR-025).

**사용자**: (합성) K 60, 0.25 MPa, WS-Z1-50A → Z1, WS-Z2-50A → Z2, 담수.

```
spr_analyze_drawing {"filePath": "D:\\work\\water-spray-iso-synthetic.dxf", "options": {"scaleMmPerUnit": 1}}
spr_analyze_drawing {"candidateId": "<id>", "show": "runs"}

bulc_plan_check {"goal": "물분무 구역 설계와 펌프", "steps": [
  {"tool": "spr_import_network", "args": {"candidateId": "<id>", "mode": "replace", "dryRun": true, "zoneByLine": {"WS-Z1-50A": "Z1", "WS-Z2-50A": "Z2"}, "defaults": {"nozzleKind": "open", "kFactor": 60, "requiredPressure": 0.25}}},
  {"tool": "spr_import_network", "args": {"candidateId": "<id>", "mode": "replace", "zoneByLine": {"WS-Z1-50A": "Z1", "WS-Z2-50A": "Z2"}, "defaults": {"nozzleKind": "open", "kFactor": 60, "requiredPressure": 0.25}}},
  {"tool": "spr_set_defaults", "args": {"operation": "zone_deluge"}},
  {"tool": "spr_run_calc", "args": {"mode": "design"}},
  {"tool": "spr_pump_sizing", "args": {"mode": "from_design", "fluid": "fresh"}},
  {"tool": "spr_design_review", "args": {}},
  {"tool": "validate_project", "args": {}}
]}
→ verdict: ok — 0 error(s), 0 warning(s), 0 note(s) for 7 step(s) · tools from the live app
```

이후 `spr_get_results {"detail": "zones", "at": "design"}` 로 구역별 필요 수원 압력과 지배 노즐을, `spr_pump_sizing` 결과로 정격점과 곡선 조건을, `spr_design_review` 로 오류 0 건을 확인한 뒤 `spr_export_results {"outputDir": "D:\\work\\ws_out", "format": "both"}` 로 계산서를 씁니다. 보고에는 노즐 값의 출처(사양서 판)와 '원문 확인 필요' 표시를 넣습니다(SPR-053, LLM-028).
