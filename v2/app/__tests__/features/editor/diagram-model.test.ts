import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDiagram,
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
