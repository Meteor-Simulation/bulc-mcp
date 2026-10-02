#!/usr/bin/env python3
"""Consistency check for the BULC knowledge pack.

    python knowledge/scripts/validate_knowledge.py [tools.json]

Checks
  - ontology.yaml / rules.yaml parse, rule ids are unique, required rule fields exist
  - every rule id referenced from the ontology, the common-mistake list and the playbooks exists
  - ontology relations, parents, areas and triples point at defined classes
  - ontology.jsonld is up to date with ontology.yaml
  - (optional) every tool named in the ontology / rules exists in a tools list
    (a JSON file with {"tools": [{"name": ...}, ...]}, e.g. a saved MCP tools/list result)
Exit code 1 on any problem.
"""
import json
import pathlib
import re
import sys

import yaml

HERE = pathlib.Path(__file__).resolve().parent
K = HERE.parent
sys.dont_write_bytecode = True  # keep the repository free of __pycache__
sys.path.insert(0, str(HERE))
from build_ontology_jsonld import build  # noqa: E402

REQUIRED_RULE_KEYS = ("id", "domain", "severity", "confidence", "title", "condition")
SEVERITIES = {"error", "warning", "info"}
CONFIDENCES = {"verified", "convention", "guidance", "regulatory_verify", "engine_snapshot"}


def main() -> int:
    problems = []
    onto = yaml.safe_load((K / "ontology.yaml").read_text(encoding="utf-8"))
    rules_doc = yaml.safe_load((K / "rules.yaml").read_text(encoding="utf-8"))
    rules = rules_doc["rules"]
    ids = [r.get("id") for r in rules]
    seen = set()
    for i in ids:
        if i in seen:
            problems.append(f"duplicate rule id {i}")
        seen.add(i)
    for r in rules:
        for key in REQUIRED_RULE_KEYS:
            if key not in r:
                problems.append(f"{r.get('id')}: missing {key}")
        if r.get("severity") not in SEVERITIES:
            problems.append(f"{r.get('id')}: bad severity {r.get('severity')}")
        if r.get("confidence") not in CONFIDENCES:
            problems.append(f"{r.get('id')}: bad confidence {r.get('confidence')}")

    classes = onto["classes"]
    for name, cls in classes.items():
        for rid in cls.get("rules") or []:
            if rid not in seen:
                problems.append(f"ontology {name}: unknown rule {rid}")
        if cls.get("parent") and cls["parent"] not in classes:
            problems.append(f"ontology {name}: unknown parent {cls['parent']}")
        for pred, target in (cls.get("relations") or {}).items():
            if not isinstance(pred, str):
                problems.append(f"ontology {name}: non-string relation key {pred!r} (YAML 1.1 boolean?)")
            for t in target if isinstance(target, list) else [target]:
                if t not in classes:
                    problems.append(f"ontology {name}.{pred}: unknown class {t}")
    for members in onto["areas"].values():
        for c in members:
            if c not in classes:
                problems.append(f"area member {c} is not a class")
    for s, p, o in onto["triples"]:
        if s not in classes or o not in classes or not isinstance(p, str):
            problems.append(f"bad triple {s} {p} {o}")
    for r in rules:
        for a in r.get("applies_to", []):
            if a != "all" and a not in classes:
                problems.append(f"{r['id']}: applies_to unknown class {a}")
    for m in rules_doc.get("common_mistakes", []):
        for rid in m.get("rules", []):
            if rid not in seen:
                problems.append(f"{m['id']}: unknown rule {rid}")

    pat = re.compile(r"\b(?:GEN|GEO|MESH|VENT|FIRE|SURF|DEVC|OUT|SIM|EVAC|HVAC|SPR|ASET|DRW|TRB|LLM)-\d{3}\b")
    mistake_ids = {m["id"] for m in rules_doc.get("common_mistakes", [])}
    for md in sorted((K / "playbooks").glob("*.md")) + [K / "glossary.md", K / "README.md"]:
        if not md.exists():
            continue
        for rid in sorted(set(pat.findall(md.read_text(encoding="utf-8")))):
            if rid not in seen and rid not in mistake_ids:
                problems.append(f"{md.name}: unknown rule {rid}")

    jsonld_path = K / "ontology.jsonld"
    if not jsonld_path.exists():
        problems.append("ontology.jsonld missing — run build_ontology_jsonld.py")
    elif json.loads(jsonld_path.read_text(encoding="utf-8")) != json.loads(json.dumps(build(onto), ensure_ascii=False)):
        problems.append("ontology.jsonld is stale — run build_ontology_jsonld.py")

    if len(sys.argv) > 1:
        tools = {t["name"] for t in json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["tools"]}
        named = set()
        for cls in classes.values():
            for names in (cls.get("tools") or {}).values():
                named.update(names)
        for r in rules:
            for sec in ("check", "fix"):
                named.update((r.get(sec) or {}).get("tools", []) or [])
        for t in sorted(named - tools):
            problems.append(f"tool not in tools list: {t}")

    for p in problems:
        print("PROBLEM:", p)
    print(f"rules={len(rules)} classes={len(classes)} mistakes={len(rules_doc.get('common_mistakes', []))} problems={len(problems)}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
