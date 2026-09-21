import assert from "node:assert/strict";
import test from "node:test";
import { parseVimKeys, type ParseResult } from "../../../../src/features/editor/vim/vim-parser";

function parse(keys: string, mode: "normal" | "visual" = "normal", recording = false): ParseResult {
  const tokens = keys.match(/<[^>]+>|./gu) ?? [];
  return parseVimKeys(tokens, { mode, recording });
}

test("counts, registers, and operators combine into one command", () => {
  assert.deepEqual(parse("3dw"), {
    status: "complete",
    command: { type: "operator", operator: "d", motion: { kind: "simple", key: "w" }, count: 3, register: null },
  });
  assert.deepEqual(parse("2d3w"), {
    status: "complete",
    command: { type: "operator", operator: "d", motion: { kind: "simple", key: "w" }, count: 6, register: null },
  });
  assert.deepEqual(parse('"ayy'), {
    status: "complete",
    command: { type: "operator", operator: "y", motion: null, count: null, register: "a" },
  });
  assert.deepEqual(parse("gUiw"), {
    status: "complete",
    command: {
      type: "operator",
      operator: "gU",
      motion: { kind: "textobject", around: false, object: "w" },
      count: null,
      register: null,
    },
  });
  assert.equal(parse("gugu").status, "complete");
  assert.equal(parse("guu").status, "complete");
});

test("incomplete sequences wait and junk is rejected", () => {
  assert.deepEqual(parse("d"), { status: "pending" });
  assert.deepEqual(parse("d2"), { status: "pending" });
  assert.deepEqual(parse("f"), { status: "pending" });
  assert.deepEqual(parse('"'), { status: "pending" });
  assert.deepEqual(parse("g"), { status: "pending" });
  assert.deepEqual(parse("dq"), { status: "invalid" });
  assert.deepEqual(parse("gx"), { status: "invalid" });
  assert.deepEqual(parse("d<Esc>"), { status: "invalid" });
});

test("find, search, and ex prompts are recognized", () => {
  assert.deepEqual(parse("dt)"), {
    status: "complete",
    command: {
      type: "operator",
      operator: "d",
      motion: { kind: "find", find: "t", character: ")" },
      count: null,
      register: null,
    },
  });
  assert.deepEqual(parse("d/"), { status: "prompt", prefix: "/" });
  assert.deepEqual(parse(":"), { status: "prompt", prefix: ":" });
  assert.deepEqual(parse("d<search:/foo>"), {
    status: "complete",
    command: {
      type: "operator",
      operator: "d",
      motion: { kind: "search", pattern: "foo", backward: false },
      count: null,
      register: null,
    },
  });
});

test("actions carry their character or register argument", () => {
  assert.deepEqual(parse("rx"), {
    status: "complete",
    command: { type: "action", action: "replace", count: null, register: null, character: "x" },
  });
  assert.deepEqual(parse("qa"), {
    status: "complete",
    command: { type: "action", action: "startRecording", count: null, register: null, character: "a" },
  });
  assert.deepEqual(parse("q", "normal", true), {
    status: "complete",
    command: { type: "action", action: "stopRecording", count: null, register: null, character: null },
  });
  assert.deepEqual(parse("3@@"), {
    status: "complete",
    command: { type: "action", action: "playMacro", count: 3, register: null, character: "@" },
  });
  assert.equal(parse("zz").status, "complete");
  assert.equal(parse("ZZ").status, "complete");
  assert.equal(parse("gg").status, "complete");
  assert.equal(parse("0").status, "complete");
  assert.equal(parse("10G").status, "complete");
});

test("visual mode treats operators as actions and allows text objects", () => {
  assert.deepEqual(parse("d", "visual"), {
    status: "complete",
    command: { type: "action", action: "d", count: null, register: null, character: null },
  });
  assert.deepEqual(parse("iw", "visual"), {
    status: "complete",
    command: { type: "motion", motion: { kind: "textobject", around: false, object: "w" }, count: null },
  });
  assert.deepEqual(parse("iw"), { status: "invalid" });
  assert.deepEqual(parse("U", "visual").status, "complete");
});
