import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultAction, movedCaret } from "@/features/on-screen-keyboard/input";
import type { Stroke } from "@/features/on-screen-keyboard/press";

function stroke(key: string, overrides: Partial<Stroke> = {}): Stroke {
  return {
    key,
    code: key,
    keyCode: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    text: null,
    ...overrides,
  };
}

test("a character stroke inserts its text", () => {
  assert.deepEqual(defaultAction(stroke("a", { text: "a" })), { type: "insert", text: "a" });
});

test("a shortcut stroke inserts nothing", () => {
  assert.equal(defaultAction(stroke("b", { ctrlKey: true })), null);
  assert.equal(defaultAction(stroke("b", { metaKey: true })), null);
});

test("backspace and delete remove a character, or a word with control", () => {
  assert.deepEqual(defaultAction(stroke("Backspace")), {
    type: "delete",
    direction: "backward",
    granularity: "character",
  });
  assert.deepEqual(defaultAction(stroke("Delete", { ctrlKey: true })), {
    type: "delete",
    direction: "forward",
    granularity: "word",
  });
});

test("enter breaks a paragraph and control enter does nothing", () => {
  assert.deepEqual(defaultAction(stroke("Enter")), { type: "paragraph" });
  assert.equal(defaultAction(stroke("Enter", { ctrlKey: true })), null);
});

test("arrows move by character, word or line and shift extends", () => {
  assert.deepEqual(defaultAction(stroke("ArrowLeft")), {
    type: "move",
    direction: "left",
    granularity: "character",
    extend: false,
  });
  assert.deepEqual(defaultAction(stroke("ArrowRight", { ctrlKey: true, shiftKey: true })), {
    type: "move",
    direction: "right",
    granularity: "word",
    extend: true,
  });
  assert.deepEqual(defaultAction(stroke("ArrowDown")), {
    type: "move",
    direction: "forward",
    granularity: "line",
    extend: false,
  });
});

test("home and end move to line edges, or document edges with control", () => {
  assert.deepEqual(defaultAction(stroke("Home")), {
    type: "move",
    direction: "backward",
    granularity: "lineboundary",
    extend: false,
  });
  assert.deepEqual(defaultAction(stroke("End", { ctrlKey: true })), {
    type: "move",
    direction: "forward",
    granularity: "documentboundary",
    extend: false,
  });
});

test("page keys page and control a selects all", () => {
  assert.deepEqual(defaultAction(stroke("PageUp")), { type: "page", direction: -1, extend: false });
  assert.deepEqual(defaultAction(stroke("a", { ctrlKey: true })), { type: "selectAll" });
});

test("keys with no browser default return null", () => {
  assert.equal(defaultAction(stroke("F5")), null);
  assert.equal(defaultAction(stroke("Escape")), null);
  assert.equal(defaultAction(stroke("Tab")), null);
});

test("movedCaret steps by character within bounds", () => {
  assert.equal(movedCaret("abc", 1, "right", "character"), 2);
  assert.equal(movedCaret("abc", 0, "left", "character"), 0);
  assert.equal(movedCaret("abc", 3, "right", "character"), 3);
});

test("movedCaret jumps whole words", () => {
  assert.equal(movedCaret("one two three", 13, "left", "word"), 8);
  assert.equal(movedCaret("one two three", 0, "right", "word"), 3);
  assert.equal(movedCaret("one  two", 3, "right", "word"), 8);
});

test("movedCaret finds line and document edges", () => {
  const text = "first\nsecond";
  assert.equal(movedCaret(text, 8, "backward", "lineboundary"), 6);
  assert.equal(movedCaret(text, 8, "forward", "lineboundary"), 12);
  assert.equal(movedCaret(text, 8, "backward", "documentboundary"), 0);
  assert.equal(movedCaret(text, 2, "forward", "documentboundary"), 12);
});

test("movedCaret keeps its column moving between lines", () => {
  const text = "abcdef\nxy\nlonger line";
  assert.equal(movedCaret(text, 4, "forward", "line"), 9);
  assert.equal(movedCaret(text, 9, "forward", "line"), 12);
  assert.equal(movedCaret(text, 12, "backward", "line"), 9);
  assert.equal(movedCaret(text, 3, "backward", "line"), 0);
  assert.equal(movedCaret(text, 15, "forward", "line"), 21);
});
