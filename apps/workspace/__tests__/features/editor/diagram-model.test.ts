import assert from "node:assert/strict";
import test from "node:test";
import {
  addDiagramStep,
  createDefaultDiagram,
  diagramTemplates,
  nextDiagramEdgeId,
  nextDiagramNodeId,
  parseMermaidFlowchart,
  readDiagramModel,
  serializeMermaidFlowchart,
} from "../../../src/features/editor/diagram-model";

test("Mermaid flowcharts parse into a positioned editable graph", () => {
  const parsed = parseMermaidFlowchart(`flowchart LR
    start(["Start"]) -->|"review"| choice{"Ready?"}
    choice -.-> done(("Done"))
    style choice fill:#fff3bf,stroke:#f59f00`);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.model.direction, "LR");
  assert.deepEqual(parsed.model.nodes.map(({ id, shape }) => ({ id, shape })), [
    { id: "start", shape: "terminal" },
    { id: "choice", shape: "decision" },
    { id: "done", shape: "circle" },
  ]);
  assert.equal(parsed.model.edges[0]?.label, "review");
  assert.equal(parsed.model.edges[1]?.dashed, true);
  assert.equal(parsed.model.nodes[1]?.fill, "#fff3bf");
  assert.ok((parsed.model.nodes[2]?.position.x ?? 0) > (parsed.model.nodes[0]?.position.x ?? 0));
});

test("serialization is readable Mermaid and roundtrips the editable content", () => {
  const initial = createDefaultDiagram();
  initial.nodes[1] = {
    ...initial.nodes[1]!,
    label: "Review the draft",
    shape: "decision",
    fill: "#dbeafe",
  };
  initial.edges[0] = { ...initial.edges[0]!, label: "Next" };

  const source = serializeMermaidFlowchart(initial);
  assert.match(source, /^flowchart LR/m);
  assert.match(source, /idea\{"Review the draft"\}/);
  assert.match(source, /start -->\|"Next"\| idea/);
  assert.match(source, /style idea fill:#dbeafe/);

  const restored = parseMermaidFlowchart(source);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.model.nodes.find(({ id }) => id === "idea")?.label, "Review the draft");
  assert.equal(restored.model.edges[0]?.label, "Next");
});

test("source edits preserve positions and appearance for stable node ids", () => {
  const previous = createDefaultDiagram();
  previous.nodes[1] = {
    ...previous.nodes[1]!,
    position: { x: 777, y: 222 },
    fill: "#dbeafe",
  };
  const parsed = parseMermaidFlowchart(`flowchart TD
    idea["Renamed"] --> finish["Finish"]`, previous);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const idea = parsed.model.nodes.find(({ id }) => id === "idea");
  assert.deepEqual(idea?.position, { x: 777, y: 222 });
  assert.equal(idea?.fill, "#dbeafe");
  assert.notDeepEqual(parsed.model.nodes.find(({ id }) => id === "finish")?.position, { x: 0, y: 0 });
});

test("invalid and unsupported syntax returns an actionable error", () => {
  assert.deepEqual(parseMermaidFlowchart("sequenceDiagram\nA->>B: Hello"), {
    ok: false,
    error: "Start with ‘flowchart LR’ or another direction.",
  });
  const unsupported = parseMermaidFlowchart("flowchart LR\n  A === B");
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.match(unsupported.error, /Line 2/);
});

test("adding a step from a node connects it and follows the flow direction", () => {
  const fromSelected = addDiagramStep(createDefaultDiagram(), { fromId: "share" });
  const created = fromSelected.model.nodes.find(({ id }) => id === fromSelected.id);
  const share = fromSelected.model.nodes.find(({ id }) => id === "share");
  assert.equal(fromSelected.id, "step4");
  assert.ok((created?.position.x ?? 0) > (share?.position.x ?? 0));
  assert.equal(created?.position.y, share?.position.y);
  assert.deepEqual(
    fromSelected.model.edges.at(-1),
    { id: "share-step4-3", from: "share", to: "step4", label: "", dashed: false, stroke: null },
  );

  const vertical = createDefaultDiagram();
  vertical.direction = "TD";
  const below = addDiagramStep(vertical, { fromId: "start" });
  const start = below.model.nodes.find(({ id }) => id === "start");
  const added = below.model.nodes.find(({ id }) => id === below.id);
  assert.equal(added?.position.x, start?.position.x);
  assert.ok((added?.position.y ?? 0) > (start?.position.y ?? 0));
});

test("adding a step avoids stacking on occupied positions and honors explicit points", () => {
  const first = addDiagramStep(createDefaultDiagram(), { fromId: "idea" });
  const second = addDiagramStep(first.model, { fromId: "idea" });
  const one = second.model.nodes.find(({ id }) => id === first.id);
  const two = second.model.nodes.find(({ id }) => id === second.id);
  assert.notDeepEqual(one?.position, two?.position);

  const placed = addDiagramStep(createDefaultDiagram(), { at: { x: 300.6, y: -40 } });
  const node = placed.model.nodes.find(({ id }) => id === placed.id);
  assert.deepEqual(node?.position, { x: 301, y: 0 });
  assert.equal(placed.model.edges.length, 2);
});

test("edge ids stay unique even after removals reshuffle the sequence", () => {
  const model = createDefaultDiagram();
  model.edges.push({ id: "start-share-3", from: "start", to: "share", label: "", dashed: false, stroke: null });
  assert.equal(nextDiagramEdgeId(model, "start", "share"), "start-share-4");
  assert.equal(nextDiagramEdgeId(model, "idea", "start"), "idea-start-4");
});

test("every diagram template is valid, normalized, and roundtrips through Mermaid", () => {
  assert.equal(diagramTemplates.length, 3);
  for (const template of diagramTemplates) {
    const model = template.create();
    assert.deepEqual(readDiagramModel(model), model, `${template.id} should survive normalization`);
    const restored = parseMermaidFlowchart(serializeMermaidFlowchart(model));
    assert.equal(restored.ok, true, `${template.id} should roundtrip`);
    if (!restored.ok) continue;
    assert.deepEqual(
      restored.model.nodes.map(({ id, label, shape }) => ({ id, label, shape })),
      model.nodes.map(({ id, label, shape }) => ({ id, label, shape })),
    );
    assert.deepEqual(
      restored.model.edges.map(({ from, to, label, dashed }) => ({ from, to, label, dashed })),
      model.edges.map(({ from, to, label, dashed }) => ({ from, to, label, dashed })),
    );
  }
});

test("untrusted persisted models are bounded and normalized", () => {
  const model = readDiagramModel({
    version: 999,
    direction: "sideways",
    background: "url(evil)",
    nodes: [
      { id: "safe", label: "Safe", shape: "unknown", position: { x: Infinity, y: 4 } },
      { id: "safe", label: "Duplicate" },
      { id: "not valid!", label: "Invalid" },
    ],
    edges: [{ id: "edge", from: "safe", to: "missing" }],
  });
  assert.equal(model.version, 1);
  assert.equal(model.direction, "LR");
  assert.equal(model.background, null);
  assert.equal(model.nodes.length, 1);
  assert.equal(model.nodes[0]?.shape, "rectangle");
  assert.equal(model.edges.length, 0);
  assert.equal(nextDiagramNodeId(model), "step2");
});
