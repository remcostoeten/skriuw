import assert from "node:assert/strict";
import test from "node:test";
import {
  aiMenuRowNeedsInstruction,
  aiMenuRows,
  aiModelLabel,
  filterAiMenuRows,
} from "../../../src/features/ai/ai-menu-model";
import { AI_EDITOR_ACTIONS } from "../../../src/features/ai/editor-actions";

test("the menu offers every action whether or not anything is selected", () => {
  const withSelection = aiMenuRows(true);
  const withoutSelection = aiMenuRows(false);

  assert.equal(withSelection.length, AI_EDITOR_ACTIONS.length);
  assert.equal(withoutSelection.length, AI_EDITOR_ACTIONS.length);
  assert.deepEqual(
    withoutSelection.map((row) => row.action.id),
    withSelection.map((row) => row.action.id),
  );
});

test("with no selection the selection actions carry the reason, note actions do not", () => {
  const rows = aiMenuRows(false);
  const rewrite = rows.find((row) => row.action.id === "rewrite");
  const summarize = rows.find((row) => row.action.id === "summarize");

  assert.match(rewrite?.reason ?? "", /Select some text/);
  assert.equal(summarize?.reason, null);
  assert.equal(aiMenuRows(true).every((row) => row.reason === null), true);
});

test("each group heads its own first row", () => {
  const headings = aiMenuRows(true)
    .map((row) => row.heading)
    .filter((heading) => heading !== null);

  assert.deepEqual(headings, ["Selection", "This note"]);
});

test("a query searches labels and keywords and regroups what it finds", () => {
  const rows = aiMenuRows(true);

  const byKeyword = filterAiMenuRows(rows, "tldr");
  assert.deepEqual(
    byKeyword.map((row) => row.action.id),
    ["summarize"],
  );
  assert.deepEqual(
    byKeyword.map((row) => row.heading),
    ["Matches"],
  );

  assert.deepEqual(filterAiMenuRows(rows, "  "), rows);
  assert.deepEqual(filterAiMenuRows(rows, "nothing here at all"), []);
});

test("only an action that asks the writer something opens a second step", () => {
  const rows = aiMenuRows(true);
  const needs = rows
    .filter((row) => aiMenuRowNeedsInstruction(row))
    .map((row) => row.action.id);

  assert.deepEqual(needs, ["change-tone", "translate", "custom"]);
});

test("a model is named only when both halves are known", () => {
  assert.equal(aiModelLabel("ollama", "llama3"), "ollama · llama3");
  assert.equal(aiModelLabel(null, "llama3"), null);
  assert.equal(aiModelLabel("ollama", null), null);
});
