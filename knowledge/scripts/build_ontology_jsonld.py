#!/usr/bin/env python3
"""Build knowledge/ontology.jsonld from knowledge/ontology.yaml.

    python knowledge/scripts/build_ontology_jsonld.py

Requires PyYAML (pip install pyyaml). The YAML file is the source of truth;
edit it and re-run this script instead of editing the JSON-LD by hand.
"""
import json
import pathlib
from collections import OrderedDict, defaultdict

import yaml

HERE = pathlib.Path(__file__).resolve().parent
KNOWLEDGE = HERE.parent
SRC = KNOWLEDGE / "ontology.yaml"
DST = KNOWLEDGE / "ontology.jsonld"

CONTEXT = {
    "@vocab": "urn:bulc:onto:",
    "bulc": "urn:bulc:onto:",
    "tool": "urn:bulc:tool:",
    "rule": "urn:bulc:rule:",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "schema": "https://schema.org/",
    "label": {"@id": "rdfs:label", "@container": "@language"},
    "comment": {"@id": "rdfs:comment", "@language": "ko"},
    "subClassOf": {"@id": "rdfs:subClassOf", "@type": "@id"},
    "domainIncludes": {"@id": "schema:domainIncludes", "@type": "@id"},
    "rangeIncludes": {"@id": "schema:rangeIncludes", "@type": "@id"},
    "fdsNamelist": {"@id": "bulc:fdsNamelist"},
    "unit": {"@id": "bulc:unit"},
    "valueType": {"@id": "bulc:valueType"},
    "defaultValue": {"@id": "bulc:defaultValue"},
    "allowedValues": {"@id": "bulc:allowedValues", "@container": "@list"},
    "note": {"@id": "bulc:note", "@language": "ko"},
    "area": {"@id": "bulc:area"},
    "seeRule": {"@id": "bulc:seeRule", "@type": "@id"},
    "createdBy": {"@id": "bulc:createdBy", "@type": "@id"},
    "readBy": {"@id": "bulc:readBy", "@type": "@id"},
    "updatedBy": {"@id": "bulc:updatedBy", "@type": "@id"},
    "deletedBy": {"@id": "bulc:deletedBy", "@type": "@id"},
    "checkedBy": {"@id": "bulc:checkedBy", "@type": "@id"},
    "otherTool": {"@id": "bulc:otherTool", "@type": "@id"},
}

TOOL_KEYS = {
    "create": "createdBy",
    "read": "readBy",
    "update": "updatedBy",
    "delete": "deletedBy",
    "check": "checkedBy",
}


def build(onto: dict) -> dict:
    b = "bulc:"
    area_of = {c: a for a, members in onto["areas"].items() for c in members}
    graph = [{
        "@id": "bulc:",
        "@type": "schema:DefinedTermSet",
        "label": {"en": onto["title"]},
        "schema:dateModified": onto["updated"],
        "bulc:fdsVersion": onto["fds_version"],
        "bulc:conventions": json.dumps(onto["conventions"], ensure_ascii=False),
    }]
    rel_dom, rel_rng = defaultdict(set), defaultdict(set)
    tools = set()
    for name, cls in onto["classes"].items():
        node = OrderedDict()
        node["@id"] = b + name
        node["@type"] = "rdfs:Class"
        node["label"] = cls.get("label", {})
        if cls.get("description"):
            node["comment"] = cls["description"]
        if cls.get("parent"):
            node["subClassOf"] = b + cls["parent"]
        node["area"] = area_of.get(name)
        if cls.get("fds"):
            node["fdsNamelist"] = cls["fds"]
        for kind, names in (cls.get("tools") or {}).items():
            node.setdefault(TOOL_KEYS.get(kind, "otherTool"), []).extend("tool:" + t for t in names)
            tools.update(names)
        if cls.get("rules"):
            node["seeRule"] = ["rule:" + r for r in cls["rules"]]
        graph.append(node)
        for pname, prop in (cls.get("properties") or {}).items():
            pnode = OrderedDict()
            pnode["@id"] = f"{b}{name}.{pname}"
            pnode["@type"] = "rdf:Property"
            pnode["label"] = {"en": pname}
            pnode["domainIncludes"] = b + name
            if isinstance(prop, dict):
                if "type" in prop:
                    pnode["valueType"] = str(prop["type"])
                if "unit" in prop:
                    pnode["unit"] = str(prop["unit"])
                if "default" in prop:
                    pnode["defaultValue"] = prop["default"]
                if "values" in prop:
                    pnode["allowedValues"] = [str(v) for v in prop["values"]]
                if "note" in prop:
                    pnode["note"] = prop["note"]
            graph.append(pnode)
        for pred, target in (cls.get("relations") or {}).items():
            rel_dom[pred].add(name)
            for t in target if isinstance(target, list) else [target]:
                rel_rng[pred].add(t)
    for s, p, o in onto["triples"]:
        rel_dom[p].add(s)
        rel_rng[p].add(o)
    for pred in sorted(rel_dom):
        graph.append({
            "@id": b + pred,
            "@type": "rdf:Property",
            "label": {"en": pred},
            "domainIncludes": [b + x for x in sorted(rel_dom[pred])],
            "rangeIncludes": [b + x for x in sorted(rel_rng[pred])],
        })
    for t in sorted(tools):
        graph.append({"@id": "tool:" + t, "@type": "bulc:McpTool", "label": {"en": t}})
    return {"@context": CONTEXT, "@graph": graph}


def main() -> None:
    onto = yaml.safe_load(SRC.read_text(encoding="utf-8"))
    out = build(onto)
    DST.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {DST.name}: {len(out['@graph'])} nodes")


if __name__ == "__main__":
    main()
