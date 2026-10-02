# Example session 3 — reviewing an FDS deck without the app (synthetic)

The deck is `examples/decks/broken_deck_synthetic.fds`, written with deliberate mistakes.

**User**: Can you check this deck before I import it? `D:\work\broken_deck_synthetic.fds`

```
bulc_check_deck {"path": "D:\\work\\broken_deck_synthetic.fds"}
→ bulc_check_deck: 8 error(s), 5 warning(s), 3 note(s)
  - [error] GEN-009 (&HEAD line 4): CHID 'broken.deck' contains a period or space — FDS stops with ERROR(108).
  - [error] FIRE-003 (&SURF 'FIRE' line 8): … no &REAC — FDS stops with ERROR(314).
  - [error] VENT-002 (&VENT 'BURNER' line 9): The domain floor (ZMIN) is OPEN where the floor burner sits …
  - [error] GEN-003 (&OBST 'BOX' line 12): XB must be x1,x2,y1,y2,z1,z2 with min ≤ max …
  - [error] SURF-001 (&OBST 'BOX' line 12): refers to SURF 'STEEL', which is not defined.
  - [error] DEVC-009 (&DEVC 'SPK_1' line 15): PROP_ID='K80' is not defined.
  - [error] DEVC-009 (&PROP 'HEAT' line 16): … no ACTIVATION_TEMPERATURE — FDS 6.10.1 has no default (ERROR 934).
  - [error] DEVC-006 (&CTRL 'ALARM' line 18): INPUT_ID 'SD_9' is neither a DEVC nor a CTRL.
  - [warning] MESH-003 …, FIRE-001 …, GEO-006 …, OUT-001 …, OUT-008 …

bulc_knowledge_search {"query": "VENT-002"}
→ VENT-002 [error · boundary · verified] set_all_boundaries_open 은 faces 를 주지 않으면 ZMIN 까지 엽니다 …
```

**Assistant**: Eight problems stop FDS or break the fire. Fix them in this order: give CHID without a period, add a `&REAC`
line, open only the side faces instead of the floor, … When BULC is running, open the deck with `project_open` (after you agree;
older apps: File > Open), run `validate_project` and fix the rest with dedicated tools; raw text edits go through `preview_fds` →
`fds_apply_text` with a dry run first (GEN-014, GEN-017).
