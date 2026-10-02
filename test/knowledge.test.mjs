// Knowledge as MCP resources, prompts and instructions.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { connect } from "./helpers.mjs";

describe("knowledge resources, prompts and instructions", () => {
  let client;
  before(async () => (client = await connect()));
  after(async () => client?.close());

  test("instructions carry the core rules", () => {
    const text = client.getInstructions();
    assert.match(text, /GEN-018/);
    assert.match(text, /bulc_plan_check/);
    assert.match(text, /bulc_drawing_intake/);
  });

  test("resources list the knowledge pack, playbooks and examples", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    for (const u of [
      "bulc://knowledge/index",
      "bulc://knowledge/ontology",
      "bulc://knowledge/ontology.jsonld",
      "bulc://knowledge/rules",
      "bulc://knowledge/glossary",
      "bulc://knowledge/fds-6.10.1/keys",
      "bulc://knowledge/playbooks/01-architectural-drawing-fire-aset",
      "bulc://knowledge/playbooks/05-marine-water-spray-iso",
      "bulc://examples/drawings/office-plan-synthetic.dxf",
      "bulc://examples/decks/room_fire_synthetic.fds",
      "bulc://project/summary",
    ]) {
      assert.ok(uris.includes(u), `${u} missing`);
    }
  });

  test("every static resource can be read", async () => {
    const { resources } = await client.listResources();
    for (const r of resources.filter((x) => !x.uri.startsWith("bulc://project/"))) {
      const res = await client.readResource({ uri: r.uri });
      assert.ok(res.contents[0].text.length > 50, `${r.uri} is empty`);
    }
  });

  test("templates resolve rules, domains, classes, FDS groups and tools", async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.ok(resourceTemplates.some((t) => t.uriTemplate === "bulc://knowledge/rule/{id}"));
    const rule = JSON.parse((await client.readResource({ uri: "bulc://knowledge/rule/FIRE-001" })).contents[0].text);
    assert.equal(rule.id, "FIRE-001");
    assert.ok(Array.isArray(rule.mistakes));
    const domain = JSON.parse((await client.readResource({ uri: "bulc://knowledge/rules/sprinkler" })).contents[0].text);
    assert.ok(domain.length > 20);
    const cls = JSON.parse((await client.readResource({ uri: "bulc://knowledge/class/Mesh" })).contents[0].text);
    assert.equal(cls.name, "Mesh");
    const prop = JSON.parse((await client.readResource({ uri: "bulc://knowledge/fds-6.10.1/namelist/PROP" })).contents[0].text);
    assert.ok(prop.keys.ACTIVATION_TEMPERATURE);
    const tool = (await client.readResource({ uri: "bulc://tools/add_fire" })).contents[0].text;
    assert.match(tool, /# add_fire/);
    assert.match(tool, /FIRE-0\d\d/);
  });

  test("unknown resources fail cleanly", async () => {
    await assert.rejects(client.readResource({ uri: "bulc://knowledge/rule/NOPE-999" }));
  });

  test("prompts are listed with Korean and English titles", async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    for (const n of ["bulc-start", "drawing-to-fire-aset", "evacuation-rset", "hvac-smoke-control", "sprinkler-design", "marine-water-spray-iso", "troubleshooting", "review-fds-deck"]) {
      assert.ok(names.includes(n), `${n} missing`);
    }
    for (const p of prompts) assert.match(p.title, / \/ /);
  });

  test("a playbook prompt embeds its rules and the playbook text", async () => {
    const r = await client.getPrompt({ name: "drawing-to-fire-aset", arguments: { drawing_path: "D:\\work\\plan.dxf" } });
    const t = r.messages[0].content.text;
    assert.match(t, /D:\\work\\plan\.dxf/);
    assert.match(t, /Rules to follow/);
    assert.match(t, /플레이북 01/);
    assert.match(t, /\(미지정 \/ not given\)/);
  });

  test("required prompt arguments are enforced", async () => {
    await assert.rejects(client.getPrompt({ name: "troubleshooting", arguments: {} }));
  });
});
