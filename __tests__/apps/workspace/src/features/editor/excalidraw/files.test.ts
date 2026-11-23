import assert from "node:assert/strict";
import { test } from "vitest";
import { excalidrawSceneFiles, readExcalidrawImport } from "@/features/editor/excalidraw/files";

const scene = JSON.stringify({
  type: "excalidraw",
  version: 2,
  elements: [{ id: "a", type: "rectangle" }],
});

test("only .excalidraw files and the Excalidraw MIME type count as dropped drawings", () => {
  const drawing = new File([scene], "Plan.excalidraw");
  const typed = new File([scene], "from-app", { type: "application/vnd.excalidraw+json" });
  const image = new File(["x"], "export.png", { type: "image/png" });
  const json = new File([scene], "data.json", { type: "application/json" });
  assert.deepEqual(
    excalidrawSceneFiles([drawing, typed, image, json]).map((file) => file.name),
    ["Plan.excalidraw", "from-app"],
  );
  assert.deepEqual(excalidrawSceneFiles(undefined), []);
});

test("an .excalidraw file imports without loading the Excalidraw library", async () => {
  const parsed = await readExcalidrawImport(new File([scene], "Plan.excalidraw"));
  assert.ok(parsed.ok);
  assert.equal(parsed.scene.elements[0]?.id, "a");
});

test("a JSON file that is not a drawing reports why", async () => {
  const parsed = await readExcalidrawImport(new File(['{"hello":1}'], "data.json"));
  assert.deepEqual(parsed, { ok: false, reason: "The file is not an Excalidraw drawing." });
});
