import assert from "node:assert/strict";
import test from "node:test";
import type { AiCompletionRequest } from "../../../../src/contracts/ai";
import {
  createDiagramRepair,
  diagramFailure,
  diagramRepairRequest,
  diagramResultParts,
  diagramResultText,
  mermaidFenceSource,
  type DiagramCheck,
} from "../../../../src/features/ai/actions/diagram-repair";

const REQUEST: AiCompletionRequest = {
  requestId: "template",
  providerId: "fake",
  modelId: "echo",
  systemPrompt: "system",
  userPrompt: "Login, then the dashboard.",
  parameters: {
    maxOutputBytes: 1024,
    timeoutMs: 1000,
    retryCount: 0,
    temperatureMillis: null,
    topPMillis: null,
  },
};

const FENCE = "```mermaid\nflowchart TD\n  A --> B\n```";

const passes: DiagramCheck = () =>
  Promise.resolve({ ok: true, svg: "<svg/>", width: 10, height: 10 });

const fails: DiagramCheck = () =>
  Promise.resolve({ ok: false, message: "Parse error on line 2" });

test("the fence source is read from a bare, wrapped, or tilde fence", () => {
  assert.equal(mermaidFenceSource(FENCE), "flowchart TD\n  A --> B");
  assert.equal(
    mermaidFenceSource(`Here you go:\n\n${FENCE}\n\nHope that helps.`),
    "flowchart TD\n  A --> B",
  );
  assert.equal(mermaidFenceSource("~~~Mermaid\nerDiagram\n~~~"), "erDiagram");
});

test("no fence, another language, an open fence, and an empty fence all read as none", () => {
  assert.equal(mermaidFenceSource("flowchart TD\n  A --> B"), null);
  assert.equal(mermaidFenceSource("```ts\nconst a = 1;\n```"), null);
  assert.equal(mermaidFenceSource("```mermaid\nflowchart TD\n  A --> B"), null);
  assert.equal(mermaidFenceSource("```mermaid\n\n```"), null);
});

test("accepting inserts the fence alone, or the raw reply when there is none", () => {
  assert.equal(diagramResultText(`Sure!\n\n${FENCE}\n\nDone.`), FENCE);
  assert.equal(diagramResultText("  no diagram here \n"), "no diagram here");
});

test("a reply fails for a missing fence or for the renderer's own reason", async () => {
  assert.match((await diagramFailure("just prose", passes)) ?? "", /mermaid fence/);
  assert.equal(await diagramFailure(FENCE, fails), "Parse error on line 2");
  assert.equal(await diagramFailure(FENCE, passes), null);
});

test("the repair request keeps the original prompt and adds the reply and the reason", () => {
  const repaired = diagramRepairRequest(REQUEST, FENCE, "Parse error on line 2");
  assert.ok(repaired.userPrompt.startsWith(REQUEST.userPrompt));
  assert.ok(repaired.userPrompt.includes(FENCE));
  assert.ok(repaired.userPrompt.includes("Parse error on line 2"));
  assert.equal(repaired.systemPrompt, REQUEST.systemPrompt);
  assert.deepEqual(repaired.parameters, REQUEST.parameters);
});

test("the repair answers null for a diagram that renders and a request for one that does not", async () => {
  assert.equal(await createDiagramRepair(passes)(FENCE, REQUEST), null);
  const next = await createDiagramRepair(fails)(FENCE, REQUEST);
  assert.ok(next?.userPrompt.includes("Parse error on line 2"));
});

test("a reply is cut into prose and drawable fences in order", () => {
  const second = "```mermaid\nsequenceDiagram\n  A->>B: hi\n```";
  assert.deepEqual(diagramResultParts(`Here it is:\n${FENCE}\nand then\n${second}`), [
    { kind: "text", text: "Here it is:\n" },
    { kind: "diagram", source: "flowchart TD\n  A --> B" },
    { kind: "text", text: "\nand then\n" },
    { kind: "diagram", source: "sequenceDiagram\n  A->>B: hi" },
  ]);
});

test("a fence the renderer cannot draw stays readable prose", () => {
  const gantt = "```mermaid\ngantt\n  title Plan\n```";
  assert.deepEqual(diagramResultParts(gantt), [{ kind: "text", text: gantt }]);
  assert.deepEqual(diagramResultParts("No diagram here."), [
    { kind: "text", text: "No diagram here." },
  ]);
  assert.deepEqual(diagramResultParts(""), []);
});
