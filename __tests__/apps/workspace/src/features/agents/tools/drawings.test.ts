import { describe, expect, test } from "vitest";
import { parseExcalidrawFile, trackExcalidrawEditor } from "@/features/editor/drawings";
import { parseProductMarkdown } from "@/features/editor/schema";
import { createHarness } from "../harness";

const SEEDS = [
  { id: "plan", kind: "note", title: "Plan", markdown: "# Plan\n\nShip it.\n" },
  { id: "secret", kind: "note", title: "Secret", lockedAt: 5 },
] as const;

const BOX = { id: "box", type: "rectangle", x: 10, y: 20, width: 100, height: 50 };
const LABEL = { id: "label", type: "text", x: 20, y: 30, text: "Start" };
const LINK = {
  id: "link",
  type: "arrow",
  x: 5,
  y: 5,
  points: [
    [10, 10],
    [110, 60],
  ],
};

async function harnessWithDrawing() {
  const harness = createHarness([...SEEDS]);
  await harness.ok("create_drawing", { noteId: "plan", elements: [BOX, LABEL, LINK] });
  return harness;
}

describe("agent drawing tools", () => {
  test("create_drawing stores an official Excalidraw document after the note body", async () => {
    const harness = await harnessWithDrawing();
    const note = await harness.ok("read_note", { noteId: "plan" });
    expect(note.markdown).toContain("Ship it.");
    const fence = /```excalidraw\n(.+)\n```/.exec(note.markdown)?.[1] ?? "";
    expect(JSON.parse(fence)).toMatchObject({ type: "excalidraw", version: 2 });
    expect(parseExcalidrawFile(fence).ok).toBe(true);
    expect(parseProductMarkdown(note.markdown).toJSON().content).toContainEqual(
      expect.objectContaining({ type: "excalidraw" }),
    );
  });

  test("new elements are complete, and arrows start at their first point", async () => {
    const harness = await harnessWithDrawing();
    const { elements } = await harness.ok("read_drawing", { noteId: "plan", index: 0 });
    expect(elements[0]).toMatchObject({ id: "box", strokeColor: "#1e1e1e", version: 1 });
    expect(elements[1]).toMatchObject({ text: "Start", originalText: "Start", fontSize: 20 });
    expect(elements[2]).toMatchObject({
      x: 15,
      y: 15,
      width: 100,
      height: 50,
      endArrowhead: "arrow",
      points: [
        [0, 0],
        [100, 50],
      ],
    });
  });

  test("list_drawings reports every drawing in document order", async () => {
    const harness = await harnessWithDrawing();
    await harness.ok("create_drawing", { noteId: "plan", elements: [] });
    const { drawings } = await harness.ok("list_drawings", { noteId: "plan" });
    expect(drawings.map((drawing: { index: number }) => drawing.index)).toEqual([0, 1]);
    expect(drawings[0]).toMatchObject({ elementCount: 3 });
    expect(drawings[0].summary).toContain("Start");
    expect(drawings[1]).toMatchObject({ elementCount: 0 });
  });

  test("update_drawing adds, patches and removes without touching other elements", async () => {
    const harness = await harnessWithDrawing();
    const before = await harness.ok("read_drawing", { noteId: "plan", index: 0 });
    await harness.ok("update_drawing", {
      noteId: "plan",
      index: 0,
      add: [{ id: "extra", type: "ellipse", x: 0, y: 0, width: 10, height: 10 }],
      update: [{ id: "label", text: "Finish", strokeColor: "#e03131" }],
      remove: ["link"],
    });
    const { elements } = await harness.ok("read_drawing", { noteId: "plan", index: 0 });
    expect(elements.map((element: { id: string }) => element.id)).toEqual([
      "box",
      "label",
      "extra",
    ]);
    expect(elements[0]).toEqual(before.elements[0]);
    expect(elements[1]).toMatchObject({
      text: "Finish",
      originalText: "Finish",
      strokeColor: "#e03131",
      version: 2,
    });
  });

  test("update_drawing refuses ids it does not know and leaves the drawing alone", async () => {
    const harness = await harnessWithDrawing();
    const before = harness.operations.length;
    const missing = await harness.call("update_drawing", {
      noteId: "plan",
      index: 0,
      remove: ["ghost"],
    });
    expect(missing.isError).toBe(true);
    const duplicate = await harness.call("update_drawing", {
      noteId: "plan",
      index: 0,
      add: [BOX],
    });
    expect(duplicate.isError).toBe(true);
    expect(harness.operations.length).toBe(before);
  });

  test("malformed elements are refused", async () => {
    const harness = createHarness([...SEEDS]);
    for (const element of [
      { type: "rectangle", x: 0, y: 0 },
      { type: "arrow", x: 0, y: 0, points: [[0, 0]] },
      { type: "text", x: 0, y: 0, text: "   " },
      { type: "freedraw", x: 0, y: 0 },
    ]) {
      const answer = await harness.call("create_drawing", { noteId: "plan", elements: [element] });
      expect(answer.isError).toBe(true);
    }
  });

  test("locked notes are refused", async () => {
    const harness = createHarness([...SEEDS]);
    for (const [name, args] of [
      ["list_drawings", { noteId: "secret" }],
      ["read_drawing", { noteId: "secret", index: 0 }],
      ["create_drawing", { noteId: "secret", elements: [BOX] }],
      ["update_drawing", { noteId: "secret", index: 0 }],
    ] as const) {
      expect((await harness.call(name, args)).isError).toBe(true);
    }
  });

  test("writes wait for an open drawing editor to close", async () => {
    const harness = await harnessWithDrawing();
    const release = trackExcalidrawEditor();
    const refused = await harness.call("update_drawing", {
      noteId: "plan",
      index: 0,
      remove: ["box"],
    });
    release();
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("close");
    await harness.ok("update_drawing", { noteId: "plan", index: 0, remove: ["box"] });
  });
});
