# 용어집 — 한국어 ↔ English ↔ FDS 키워드 ↔ BULC 도구

사용자가 한국어로 말한 것을 정확한 FDS 키워드와 BULC MCP 도구로 옮길 때 씁니다. "FDS" 열이 비어 있으면 FDS 덱에 직접 대응하는 키가 없는 BULC 모듈 개념입니다.

## 1. 프로젝트·형상·격자

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 프로젝트, 해석 케이스 | project, case | &HEAD CHID, TITLE | project_info, project_open, project_save, set_chid (0.88 이하 앱은 파일 메뉴, GEN-014) |
| 해석 실행, 사전 점검 | run, pre-flight check | | sim_preflight, sim_start, sim_status, sim_stop (0.88 이하 앱은 run_simulation, GEN-016) |
| 결과 요약, 시계열 | results summary, time series | <CHID>_hrr.csv, _devc.csv | results_detect, fire_results_summary, fire_timeseries |
| 화면 캡처 | screenshot | | capture_view |
| 층 | story, floor level | (z 좌표) | draw_add_story, draw_list_stories, draw_update_story |
| 층고 | story height | | draw_update_story(height) |
| 층간 슬래브, 바닥판, 천장판 | floor / ceiling slab | &OBST | add_floor |
| 벽 | wall | &OBST | add_wall |
| 칸막이 | partition | &OBST | add_wall |
| 기둥, 보 | column, beam | &OBST | add_obstacle |
| 장애물, 고체 | obstruction | &OBST | add_obstacle, update_obstacle, transform_obstacle |
| 개구부, 구멍 | opening, hole | &HOLE | add_hole |
| 문, 출입문 | door | &HOLE | add_door, place_furniture |
| 창, 창문 | window | &HOLE | add_window |
| 계단실 개구부 | stair opening | &HOLE | add_hole |
| 가구, 가연물 품목 | furniture, item | &OBST(+화재 SURF) | list_furniture_catalog, place_furniture |
| 곡면, 아치, 돔 | curved / arched / vaulted geometry | &OBST(복셀) 또는 &GEOM | shape_add_arch, shape_export_obst, shape_export_geom |
| 계산 격자, 메시 | computational mesh | &MESH IJK, XB | set_mesh, set_mesh_cell_size, auto_fit_mesh |
| 다중 메시 | multi-mesh | 여러 &MESH | auto_multimesh, set_meshes, slice_mesh, merge_meshes |
| 셀 크기 | cell size | (XB/IJK) | set_mesh_cell_size, list_meshes |
| 컷셀 | cut cell | &GEOM | auto_cutcell_mesh, set_run_options(gpu_cutcell) |
| 표면, 경계조건 | surface, boundary condition | &SURF | add_surface, assign_surface, list_surfaces |
| 재료 | material | &MATL | add_material, add_material_from_library |
| 불연, 단열 | inert, adiabatic | SURF_ID='INERT', ADIABATIC | add_surface(surface_type) |

## 2. 경계·환기

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 개방 경계, 외기 개방 | open boundary | &VENT SURF_ID='OPEN' | set_open_boundary, set_all_boundaries_open |
| 벤트, 경계 패치 | vent | &VENT | add_vent, update_vent |
| 대칭면 | mirror boundary | &VENT SURF_ID='MIRROR' | add_vent(GPU 엔진 미지원) |
| 급기 | supply air | SURF VEL(음수), VOLUME_FLOW | hvac_add_supply_diffuser, hvac_apply_to_fds |
| 배기, 배출 | exhaust | SURF VEL(양수), VOLUME_FLOW | hvac_add_exhaust_grille, hvac_apply_to_fds |
| 누설 | leakage | &ZONE LEAK_AREA | add_raw_namelist |

## 3. 화재·연소

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 화원 | fire source, burner | &SURF HRRPUA + &VENT/&OBST | add_fire, set_fds_properties |
| 열방출률 | heat release rate (HRR) | (HRRPUA × 면적) | add_fire 응답, <CHID>_hrr.csv |
| 단위면적당 열방출률 | HRR per unit area | HRRPUA [kW/m²] | add_fire(hrrpua) |
| 체적 열방출률 | HRR per unit volume | HRRPUV | add_slcf(HRRPUV) |
| 화재 성장 곡선, t² 화재 | fire growth curve, t-squared fire | &RAMP + RAMP_Q, TAU_Q | add_fire(growth, time_to_peak), add_ramp |
| 성장 계수 | fire growth coefficient α | | FIRE-004 |
| 연료 | fuel | &REAC FUEL | update_reaction(fuel) |
| 그을음 수율 | soot yield | SOOT_YIELD | update_reaction(soot_yield) |
| 일산화탄소 수율 | CO yield | CO_YIELD | update_reaction(co_yield) |
| 복사 분율 | radiative fraction | &REAC RADIATIVE_FRACTION | update_reaction(radiative_fraction) |
| 연소열 | heat of combustion | HEAT_OF_COMBUSTION | update_reaction(heat_of_combustion) |
| 표면 온도 고정 | fixed surface temperature | TMP_FRONT [°C] | add_fire(tmp_front), add_surface(tmp_front) |
| 소화 계수 | extinguishing coefficient | E_COEFFICIENT | set_fds_properties(fds_override.ext_coeff) |
| 특성 화재 직경 | characteristic fire diameter D* | | MESH-002 |
| 해석 모드 | simulation mode | &MISC SIMULATION_MODE | set_simulation_mode |
| 해석 종료 시간 | end time | &TIME T_END | set_time |
| 주변 온도·습도 | ambient temperature, humidity | &MISC TMPA, HUMIDITY | set_ambient |

## 4. 장치·감지·제어

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 계측 장치, 측정점 | device, probe | &DEVC | add_device, list_devices |
| 열전대 | thermocouple | QUANTITY='THERMOCOUPLE' | add_thermocouple |
| 열감지기 | heat detector | &PROP QUANTITY='LINK TEMPERATURE' | add_heat_detector |
| 연기감지기 | smoke detector | &PROP QUANTITY='CHAMBER OBSCURATION' | add_smoke_detector |
| 작동 온도 | activation temperature | ACTIVATION_TEMPERATURE [°C] | add_sprinkler, add_heat_detector |
| 반응 시간 지수 | response time index (RTI) | RTI [(m·s)^½] | add_sprinkler(rti) |
| 제어 논리 | control function | &CTRL FUNCTION_TYPE, INPUT_ID | add_control |
| 지연 | time delay | FUNCTION_TYPE='TIME_DELAY' | add_control |
| 연기층 높이 | smoke layer height | QUANTITY='LAYER HEIGHT' | add_device |
| 체적 유량 | volume flow | QUANTITY='VOLUME FLOW' | add_device(xb 평면) |
| 작동 헤드 수 | actuated sprinklers | QUANTITY='ACTUATED SPRINKLERS' | add_device |

## 5. 출력·결과

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 단면 슬라이스 | slice file | &SLCF PBX/PBY/PBZ | add_slcf |
| 경계면 출력 | boundary file | &BNDF | add_bndf |
| 3D 전체장 | Plot3D | &DUMP PLOT3D_QUANTITY | set_plot3d_outputs |
| 3D 연기 | Smoke3D | &DUMP DT_SMOKE3D | update_dump_config |
| 출력 주기 | output interval | &DUMP DT_SLCF, DT_PL3D, DT_DEVC, DT_HRR … | update_dump_config |
| 가시거리 | visibility | QUANTITY='VISIBILITY' | add_slcf, add_device |
| 소광계수 | extinction coefficient | EXTINCTION COEFFICIENT | add_device |
| 부피분율 | volume fraction | QUANTITY='VOLUME FRACTION' + SPEC_ID | add_slcf, add_device |
| 결과 뷰어 | result viewer | (Smokeview 호환 파일) | result_set_active_dataset, result_set_time |
| 실행 지표 | runtime metrics | | get_simulation_metrics |

## 6. 피난(EVAC)

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 피난자, 재실자 | evacuee, occupant, agent | | evac_add_agent, evac_add_agents_batch |
| 출구 | exit | (Door_ HOLE, OPEN 벤트, 문 품목) | add_door(id='Door_…') |
| 계단 | stair | | evac_add_stair |
| 경유점 | waypoint | | evac_add_waypoint |
| 피난 경로, 여정 | journey, route | | evac_add_journey |
| 대기 구역·대기열 | waiting set, queue | | (여정 단계 WAITING_SET, QUEUE) |
| 보행 모델 | pedestrian model | | evac_update_setup(model) |
| 호흡한계선 | breathing height | (z = 층 바닥 + 1.8 m) | output_add_tenability_slices, add_slcf(pbz) |
| 유효 노출 분율 | fractional effective dose (FED) | QUANTITY='FED' | 앱의 FED 연계 설정 |
| 피난 실행 | evacuation run | | evac_run, evac_status, evac_stop |
| 피난 허용 시간 | available safe egress time (ASET) | | fire_compute_aset, 앱의 ASET/RSET 보고서 |
| 피난 소요 시간 | required safe egress time (RSET) | | evac_get_results, 앱의 ASET/RSET 보고서 |
| 피난 개시 지연 | pre-movement time | | ASET-005 |
| 경보 연동 | alarm chain | | 앱의 경보 설정 |

## 7. HVAC·제연

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 제연설비 | smoke control system | | 플레이북 03 |
| 거실 제연 | room smoke exhaust | | hvac_* |
| 급기 가압(부속실 제연) | pressurisation | | hvac_* (단말 급기) |
| 덕트 | duct | (&HVAC TYPE_ID='DUCT') | hvac_add_duct |
| 노드, 분기점 | node, junction | (&HVAC TYPE_ID='NODE') | hvac_add_node |
| 송풍기, 공조기 | fan, air handling unit (AHU) | (&HVAC TYPE_ID='FAN') | hvac_add_air_handler |
| 급기 디퓨저 | supply diffuser | | hvac_add_supply_diffuser |
| 배기 그릴 | exhaust grille | | hvac_add_exhaust_grille |
| 풍량 | airflow rate | VOLUME_FLOW [m³/s] | airflowCFM [CFM] |
| 정압 | static pressure | | hvac_add_air_handler(staticPressurePa) |
| 기동 지연 | start-up delay | RAMP_V | set_fds_properties(fds_override.ramp_up_points) |

## 8. 스프링클러·물분무

| 한국어 | English | FDS 키워드 | BULC 도구 |
|---|---|---|---|
| 스프링클러 헤드 | sprinkler head | &DEVC + &PROP QUANTITY='SPRINKLER LINK TEMPERATURE' + &PART | add_sprinkler, spr_apply_to_fds |
| 폐쇄형 헤드 | closed (automatic) sprinkler | | nozzleKind='closed' |
| 개방형 노즐 | open nozzle | | nozzleKind='open' |
| 드레인 | drain hole | | spr_add_drain, nozzleKind='drain' |
| 방출계수 | K-factor | K_FACTOR [L/(min·bar^½)] | kFactor, k_factor |
| 방사압, 방수압 | discharge / operating pressure | OPERATING_PRESSURE [bar] | requiredPressure [MPa] |
| 요구 방사압 | required discharge pressure | | spr_set_nozzles(requiredPressure) |
| 방수량 | discharge flow | FLOW_RATE [L/min] | spr_get_results |
| 분무각 | spray angle | SPRAY_ANGLE | spr_upsert_spray_profile |
| 물방울 지름 | droplet diameter | &PART DIAMETER [µm] | spr_upsert_spray_profile(part) |
| 분무 프로파일 | spray profile | &PROP + &PART 묶음 | spr_upsert_spray_profile |
| 배관망 | pipe network | | spr_list_summary |
| 주배관, 교차배관, 가지배관 | main, cross main, branch line | | spr_add_pipe, spr_auto_layout |
| 입상관 | riser | | spr_add_riser |
| 관 부속(엘보·티·레듀서) | fitting (elbow, tee, reducer) | | spr_insert_fitting |
| 밸브(게이트·버터플라이·체크·알람) | valve (gate, butterfly, check, alarm) | | spr_add_pipe(valveDetails), spr_set_valves |
| 구역 밸브 | zone valve | | spr_set_valves(setZone) |
| 일제살수 구역 | deluge zone | | spr_set_nozzles(setZone) |
| 라인 번호 | line number | | lineNo |
| 호칭경 | nominal size (A) | | diameter [mm] |
| 관 규격·스케줄 | pipe standard, schedule | | material (예: JIS_G3454_STPG_SCH40) |
| 조도 계수 | Hazen-Williams C | | cFactor |
| 상당길이 | equivalent length | | spr_set_defaults(includeMinorLosses) |
| 수원 | water source | | spr_add_water_source |
| 시수(정압·잔압) | city water (static, residual) | | sourceType='city_water' |
| 고가수조 | gravity tank | | sourceType='gravity_tank' |
| 압력수조 | pressure tank | | sourceType='pressure_tank' |
| 수원압력 역산 | required source pressure (inverse) | | spr_run_calc(mode='design') |
| 지배 노즐·지배 구역 | governing nozzle / zone | | spr_get_results |
| 펌프 정격·체절 | pump rated point, churn (shut-off) | | spr_pump_sizing |
| 유효흡입수두 | NPSH available | | spr_pump_sizing |
| 설계·사양 검토 | design and specification review | | spr_design_review |
| 압력 등급(10K, PN16, Class 150) | pressure class | | spr_design_review(defaultFlangeClass) |
| 계산서 | hydraulic calculation report | | spr_export_results |
| 배관 아이소 도면 | piping isometric (ISO) | | spr_analyze_drawing |
| 건축 평면도 | architectural floor plan | (&OBST 벽, &HOLE 문·창) | arch_analyze_drawing, arch_import_building, arch_import_floorplan_report |

## 9. 기준·법규(확인 필요)

| 한국어 | English | 비고 |
|---|---|---|
| 성능위주설계 | performance-based design (PBD) | ASET-002 |
| 화재안전기술기준(NFTC) | Korean fire safety technical standards | NFTC 103 스프링클러, NFTC 501 제연 |
| 화재안전성능기준(NFPC) | Korean fire safety performance standards | |
| 기준개수 | design number of heads | SPR-017 |
| 수평거리 | horizontal coverage distance | SPR-051 |
| 국제가스운반선코드 | IGC Code | SPR-053 |
| 해상인명안전협약 | SOLAS, FSS Code | SPR-053 |
| 선급 규칙 | classification society rules | SPR-053, SPR-054 |

## 10. 단위 바꾸기

| 바꾸기 | 식 |
|---|---|
| mm → m | × 0.001 |
| ft → m | × 0.3048 |
| gpm → L/min | × 3.785 |
| psi → bar | × 0.06895 |
| bar → MPa | × 0.1 |
| MPa → m 수두(청수) | × 102 |
| US K(gpm/psi^½) → 미터 K | × 14.41 |
| m³/h → CFM | × 0.5886 |
| m³/min → CFM | × 35.31 |
| CFM → m³/s | × 0.000471947 |
| 부피분율 → ppm | × 10⁶ |
| 부피분율 → % | × 100 |
| K → °C | − 273.15 |
