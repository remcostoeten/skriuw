import assert from "node:assert/strict";
import { test } from "vitest";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { EMPTY_EXCALIDRAW_SCENE_SOURCE } from "@/features/editor/excalidraw/scene";

const scene = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "https://skriuw.com",
  elements: [{ id: "a", type: "rectangle", x: 1, y: 2, width: 3, height: 4 }],
  appState: {},
  files: {},
});

test("an excalidraw fence becomes a drawing block that round-trips its scene", () => {
  const document = parseProductMarkdown(`Intro\n\n\`\`\`excalidraw\n${scene}\n\`\`\`\n\nOutro`);
  const block = document.child(1);
  assert.equal(block.type.name, "excalidraw");
  assert.equal(block.attrs.scene, scene);
  assert.equal(
    serializeProductMarkdown(document),
    `Intro\n\n\`\`\`excalidraw\n${scene}\n\`\`\`\n\nOutro`,
  );
});

test("an official file pasted into a fence is normalized into the stored form", () => {
  const pretty = JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [{ id: "a", type: "rectangle", x: 1, y: 2, width: 3, height: 4 }],
      appState: { viewBackgroundColor: "#ffffff", zoom: { value: 1 } },
    },
    null,
    2,
  );
  const block = parseProductMarkdown(`\`\`\`excalidraw\n${pretty}\n\`\`\``).firstChild;
  assert.equal(block?.type.name, "excalidraw");
  const stored = JSON.parse(String(block?.attrs.scene));
  assert.equal(stored.source, "https://skriuw.com");
  assert.deepEqual(stored.appState, { viewBackgroundColor: "#ffffff" });
  assert.deepEqual(stored.files, {});
});

test("an excalidraw fence that is not a drawing stays a code block", () => {
  const block = parseProductMarkdown("```excalidraw\nnot a drawing\n```").firstChild;
  assert.equal(block?.type.name, "code_block");
  assert.equal(block?.textContent, "not a drawing");
});

test("a new drawing block serializes as an empty official scene", () => {
  const block = productSchema.nodes.excalidraw?.create();
  assert.ok(block);
  const document = productSchema.node("doc", null, [block]);
  assert.equal(
    serializeProductMarkdown(document),
    `\`\`\`excalidraw\n${EMPTY_EXCALIDRAW_SCENE_SOURCE}\n\`\`\``,
  );
});

test("drawing blocks survive the document JSON round trip", () => {
  const document = parseProductMarkdown(`\`\`\`excalidraw\n${scene}\n\`\`\``);
  const restored = productSchema.nodeFromJSON(document.toJSON());
  assert.equal(restored.firstChild?.attrs.scene, scene);
});
