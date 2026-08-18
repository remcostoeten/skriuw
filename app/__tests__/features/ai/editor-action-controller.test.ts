import assert from "node:assert/strict";
import test from "node:test";
import {
  aiEditorActionCommands,
  clearPendingAiAction,
  registerAiActionListener,
  requestAiAction,
} from "../../../src/features/ai/editor-action-controller";
import { AI_EDITOR_ACTIONS } from "../../../src/features/ai/editor-actions";
import type { CommandUiState } from "../../../src/commands/registry";
import type { RendererState } from "../../../src/store/types";

const NOTES_UI = {
  route: "notes",
  sidebarOpen: true,
  metadataOpen: true,
  settingsOpen: false,
} as CommandUiState;

function stateWith(activeNoteId: string | null): RendererState {
  return { activeNoteId } as RendererState;
}

test("no AI editor command exists while AI is opted out", () => {
  assert.deepEqual(aiEditorActionCommands(false), []);
});

test("every action reaches the palette with its own command", () => {
  const commands = aiEditorActionCommands(true);
  const ids = new Set(commands.map((command) => command.id));

  assert.equal(ids.has("ai-actions"), true);
  for (const action of AI_EDITOR_ACTIONS) {
    assert.equal(ids.has(`ai-action-${action.id}`), true);
  }
  assert.equal(ids.size, commands.length);
  assert.equal(
    commands.every((command) => command.group === "AI"),
    true,
  );
});

test("AI commands stay disabled away from an open note", () => {
  const command = aiEditorActionCommands(true).find((entry) => entry.id === "ai-action-rewrite");
  assert.ok(command);

  assert.equal(command.enabled?.(stateWith("note-1"), NOTES_UI), true);
  assert.equal(command.enabled?.(stateWith(null), NOTES_UI), false);
  assert.equal(
    command.enabled?.(stateWith("note-1"), { ...NOTES_UI, route: "tasks" } as CommandUiState),
    false,
  );
});

function listener(focused: boolean, seen: (string | null)[]) {
  return { isFocused: () => focused, open: (actionId: string | null) => seen.push(actionId) };
}

test("a request made before the host mounts replays exactly once", () => {
  clearPendingAiAction();
  requestAiAction("rewrite");

  const seen: (string | null)[] = [];
  const unregister = registerAiActionListener(listener(true, seen));
  assert.deepEqual(seen, ["rewrite"]);

  requestAiAction(null);
  assert.deepEqual(seen, ["rewrite", null]);
  unregister();

  const later: (string | null)[] = [];
  const second = registerAiActionListener(listener(true, later));
  assert.deepEqual(later, []);
  second();
});

test("a queued request is dropped when the gate closes before a host appears", () => {
  clearPendingAiAction();
  requestAiAction("summarize");
  clearPendingAiAction();

  const seen: (string | null)[] = [];
  const unregister = registerAiActionListener(listener(true, seen));
  assert.deepEqual(seen, []);
  unregister();
});

test("with a split open the pane holding the caret answers the request", () => {
  clearPendingAiAction();
  const left: (string | null)[] = [];
  const right: (string | null)[] = [];
  const unregisterLeft = registerAiActionListener(listener(true, left));
  const unregisterRight = registerAiActionListener(listener(false, right));

  requestAiAction("rewrite");
  assert.deepEqual(left, ["rewrite"]);
  assert.deepEqual(right, []);

  unregisterLeft();
  unregisterRight();
});

test("with focus outside both panes the most recent one answers", () => {
  clearPendingAiAction();
  const left: (string | null)[] = [];
  const right: (string | null)[] = [];
  const unregisterLeft = registerAiActionListener(listener(false, left));
  const unregisterRight = registerAiActionListener(listener(false, right));

  requestAiAction(null);
  assert.deepEqual(left, []);
  assert.deepEqual(right, [null]);

  unregisterRight();
  requestAiAction("summarize");
  assert.deepEqual(left, ["summarize"]);
  unregisterLeft();
});
