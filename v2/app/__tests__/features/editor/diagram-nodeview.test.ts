import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultDiagram } from "../../../src/features/editor/diagram-model";
import {
  connectorPath,
  diagramBounds,
  diagramEdgeSummary,
  incidentDiagramEdges,
} from "../../../src/features/editor/diagram-nodeview";

test("diagram geometry bounds the canvas and routes connectors between nodes", () => {
  const model = createDefaultDiagram();
  assert.deepEqual(diagramBounds(model), { width: 664, height: 148 });
  assert.equal(
    connectorPath(model.nodes[0]!.position, model.nodes[1]!.position),
    "M 160 70 C 202 70, 210 70, 252 70",
  );
});

test("edge summaries expose the visual relationship as text", () => {
  const model = createDefaultDiagram();
  model.edges[0] = { ...model.edges[0]!, label: "then" };
  assert.equal(diagramEdgeSummary(model, model.edges[0]!), "Start to Shape the idea: then");
});

test("drag work selects only connectors incident to the moved node", () => {
  const model = createDefaultDiagram();
  assert.deepEqual(
    incidentDiagramEdges(model, "start").map(({ id }) => id),
    ["start-idea"],
  );
  assert.deepEqual(
    incidentDiagramEdges(model, "idea").map(({ id }) => id),
    ["start-idea", "idea-share"],
  );
});
