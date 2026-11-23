import assert from "node:assert/strict";
import { test } from "vitest";
import {
  EMPTY_EXCALIDRAW_SCENE_SOURCE,
  MAX_EXCALIDRAW_SCENE_BYTES,
  excalidrawFileName,
  excalidrawFileText,
  excalidrawSceneLabel,
  liveExcalidrawElementCount,
  parseExcalidrawFile,
  pruneExcalidrawScene,
  readStoredExcalidrawScene,
  serializeExcalidrawScene,
} from "@/features/editor/excalidraw/scene";

const officialFile = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    { id: "rect", type: "rectangle", x: 10, y: 20, width: 100, height: 50, isDeleted: false },
    { id: "gone", type: "ellipse", x: 0, y: 0, width: 5, height: 5, isDeleted: true },
    { id: "pic", type: "image", x: 0, y: 0, width: 5, height: 5, fileId: "file-a" },
  ],
  appState: { viewBackgroundColor: "#fdf6e3", gridSize: 20, zoom: { value: 2 }, theme: "dark" },
  files: {
    "file-a": { id: "file-a", mimeType: "image/png", dataURL: "data:image/png;base64,AA==" },
    "file-b": { id: "file-b", mimeType: "image/png", dataURL: "data:image/png;base64,BB==" },
  },
});

test("an official .excalidraw file parses with its elements, files and file appState", () => {
  const parsed = parseExcalidrawFile(officialFile);
  assert.ok(parsed.ok);
  assert.deepEqual(
    parsed.scene.elements.map((element) => element.id),
    ["rect", "gone", "pic"],
  );
  assert.deepEqual(parsed.scene.appState, { viewBackgroundColor: "#fdf6e3", gridSize: 20 });
  assert.deepEqual(Object.keys(parsed.scene.files), ["file-a", "file-b"]);
  assert.equal(liveExcalidrawElementCount(parsed.scene), 2);
});

test("the clipboard payload Excalidraw copies parses as a scene", () => {
  const parsed = parseExcalidrawFile(
    JSON.stringify({ type: "excalidraw/clipboard", elements: [{ id: "a", type: "text" }] }),
  );
  assert.ok(parsed.ok);
  assert.equal(parsed.scene.elements.length, 1);
});

test("files that are not drawings are rejected with a reason", () => {
  for (const text of [
    "not json",
    JSON.stringify({ type: "excalidrawlib", libraryItems: [] }),
    JSON.stringify({ type: "excalidraw", elements: [{ type: "rectangle" }] }),
    JSON.stringify({ type: "excalidraw", elements: "nope" }),
    JSON.stringify([1, 2, 3]),
  ]) {
    const parsed = parseExcalidrawFile(text);
    assert.equal(parsed.ok, false, text);
  }
});

test("embedded files without a data URL are dropped", () => {
  const parsed = parseExcalidrawFile(
    JSON.stringify({
      type: "excalidraw",
      elements: [],
      files: { x: { id: "x", mimeType: "image/png", dataURL: "https://example.com/x.png" } },
    }),
  );
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.scene.files, {});
});

test("a drawing over the size cap is rejected before parsing", () => {
  const parsed = parseExcalidrawFile(" ".repeat(MAX_EXCALIDRAW_SCENE_BYTES + 1));
  assert.deepEqual(parsed, { ok: false, reason: "The drawing is larger than 8 MB." });
});

test("pruning drops deleted elements and files no image points at", () => {
  const parsed = parseExcalidrawFile(officialFile);
  assert.ok(parsed.ok);
  const pruned = pruneExcalidrawScene(parsed.scene);
  assert.deepEqual(
    pruned.elements.map((element) => element.id),
    ["rect", "pic"],
  );
  assert.deepEqual(Object.keys(pruned.files), ["file-a"]);
});

test("the stored scene and the saved file are the official format and read back", () => {
  const parsed = parseExcalidrawFile(officialFile);
  assert.ok(parsed.ok);
  const stored = serializeExcalidrawScene(parsed.scene);
  const document = JSON.parse(stored);
  assert.equal(document.type, "excalidraw");
  assert.equal(document.version, 2);
  assert.equal(document.source, "https://skriuw.com");
  assert.deepEqual(readStoredExcalidrawScene(stored), parsed.scene);
  const file = excalidrawFileText(parsed.scene);
  assert.ok(file.includes('\n  "type": "excalidraw"'));
  assert.deepEqual(JSON.parse(file), document);
});

test("an empty drawing stores an empty official document", () => {
  assert.deepEqual(JSON.parse(EMPTY_EXCALIDRAW_SCENE_SOURCE), {
    type: "excalidraw",
    version: 2,
    source: "https://skriuw.com",
    elements: [],
    appState: {},
    files: {},
  });
});

test("file names come from the note title without characters file systems reject", () => {
  assert.equal(excalidrawFileName("Q3 plan / draft"), "Q3 plan draft.excalidraw");
  assert.equal(excalidrawFileName('a<b>c:"d"|e?*f\u0007g'), "a b c d e f g.excalidraw");
  assert.equal(excalidrawFileName("  "), "Drawing.excalidraw");
  assert.equal(excalidrawFileName("...hidden"), "hidden.excalidraw");
});

test("a preview label counts live elements and reads the text in the drawing", () => {
  const parsed = parseExcalidrawFile(
    JSON.stringify({
      type: "excalidraw",
      elements: [
        { id: "a", type: "rectangle" },
        { id: "b", type: "text", text: "  Login\nflow " },
        { id: "c", type: "text", text: "old", isDeleted: true },
      ],
    }),
  );
  assert.ok(parsed.ok);
  assert.equal(excalidrawSceneLabel(parsed.scene), "Drawing with 2 elements: Login flow");
  assert.equal(
    excalidrawSceneLabel({ elements: [], appState: {}, files: {} }),
    "Drawing with 0 elements",
  );
});
