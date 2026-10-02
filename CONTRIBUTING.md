# Contributing / 기여 안내

Thank you for helping. Issues and pull requests are welcome in Korean or English.

## Ground rules

- **Never attach real drawings, project files, results or logs that identify a customer, a site or a person.** Reproduce problems
  with the synthetic examples in `examples/` or with a new synthetic file. 실제 도면·프로젝트 파일은 첨부하지 마십시오.
- Keep the runtime dependency list minimal; copyleft licences (GPL, AGPL, LGPL, SSPL …) are not accepted.
- Commit messages and pull-request titles follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat: …`, `fix: …`, `docs: …`, `chore: …`).

## Development

```bash
npm install
npm run check   # typecheck · build · tests · knowledge lint · public-content scan · licence check
```

- Knowledge sources live in `knowledge/` (YAML/Markdown) and `prompts/prompts.yaml`. After editing `knowledge/ontology.yaml`, run
  `python knowledge/scripts/build_ontology_jsonld.py` (PyYAML) and `npm run lint:knowledge`.
- Rule ids are stable: never reuse or renumber an id. Every rule needs `title` (ko) and `title_en`, a `condition`, and a `fix`.
  Regulatory values must be marked `confidence: regulatory_verify`.
- New local tools go in `src/local-tools/` with a test in `test/`.

## Updating the tool snapshot

The snapshot is exported from the BULC app by Meteor Simulation (names, descriptions and schemas only) and imported with:

```bash
node scripts/import-snapshot.mjs <export.json> --app-version X.Y.Z
npm run check
```

The import refuses files that contain paths, e-mail addresses, keys or tokens.
