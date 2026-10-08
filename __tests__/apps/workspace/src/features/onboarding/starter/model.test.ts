import assert from "node:assert/strict";
import { test } from "vitest";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import {
  completeSeed,
  forgetSeededNotes,
  hasSeededStarter,
  isUnseededFreshWorkspace,
  markSeedSpent,
  reclaimableNoteIds,
  reclaimableTaskIds,
  seededNoteIds,
  shouldSeedStarter,
} from "@/features/onboarding/starter/model";
import type { WorkspaceTask } from "@skriuw/renderer-core/contracts/workspace";

const SEEDED_AT = 1_000;

function seeded() {
  return completeSeed(DEFAULT_WORKSPACE_SETTINGS, ["a", "b"], SEEDED_AT);
}

test("a fresh anonymous workspace is seeded", () => {
  assert.equal(shouldSeedStarter(DEFAULT_WORKSPACE_SETTINGS, 0, false), true);
});

test("an authenticated device is never seeded", () => {
  assert.equal(shouldSeedStarter(DEFAULT_WORKSPACE_SETTINGS, 0, true), false);
  assert.equal(isUnseededFreshWorkspace(DEFAULT_WORKSPACE_SETTINGS, 0), true);
});

test("a workspace with content is never seeded", () => {
  assert.equal(shouldSeedStarter(DEFAULT_WORKSPACE_SETTINGS, 3, false), false);
});

test("deleting every seeded note does not seed again", () => {
  const settings = seeded();
  assert.equal(hasSeededStarter(settings), true);
  assert.equal(shouldSeedStarter(settings, 0, false), false);
  assert.equal(isUnseededFreshWorkspace(settings, 0), false);
});

test("a skipped seed is still spent", () => {
  const settings = markSeedSpent(DEFAULT_WORKSPACE_SETTINGS);
  assert.equal(shouldSeedStarter(settings, 0, false), false);
  assert.deepEqual(seededNoteIds(settings), []);
  assert.equal(markSeedSpent(settings), settings);
});

test("untouched preview notes are reclaimable", () => {
  const present = [
    { id: "a", updatedAt: SEEDED_AT },
    { id: "b", updatedAt: SEEDED_AT },
  ];
  assert.deepEqual(reclaimableNoteIds(seeded(), present), ["a", "b"]);
});

test("an edited preview note belongs to the visitor", () => {
  const present = [
    { id: "a", updatedAt: SEEDED_AT + 1 },
    { id: "b", updatedAt: SEEDED_AT },
  ];
  assert.deepEqual(reclaimableNoteIds(seeded(), present), ["b"]);
});

test("notes the visitor created are never reclaimed", () => {
  const present = [{ id: "mine", updatedAt: SEEDED_AT }];
  assert.deepEqual(reclaimableNoteIds(seeded(), present), []);
});

test("reclaiming clears the note list but keeps the seed spent", () => {
  const settings = forgetSeededNotes(seeded());
  assert.deepEqual(seededNoteIds(settings), []);
  assert.equal(hasSeededStarter(settings), true);
  assert.equal(shouldSeedStarter(settings, 0, false), false);
  assert.equal(forgetSeededNotes(settings), settings);
});

test("a workspace that never seeded has nothing to reclaim", () => {
  assert.deepEqual(reclaimableNoteIds(DEFAULT_WORKSPACE_SETTINGS, [{ id: "a", updatedAt: 1 }]), []);
});

test("reclaiming removes untouched example tasks and preserves adopted or edited work", () => {
  function task(id: string, noteId: string | null, updatedAt = SEEDED_AT): WorkspaceTask {
    return {
      id,
      title: id,
      status: "todo",
      priority: "medium",
      dueDate: null,
      description: "",
      tagIds: [],
      assigneeIds: [],
      source: noteId === null ? null : { noteId, blockId: `block-${id}` },
      detachedAt: noteId === null ? updatedAt : null,
      createdAt: SEEDED_AT,
      updatedAt,
    };
  }
  const tasks = [
    task("preview", "a"),
    task("edited", "a", SEEDED_AT + 1),
    task("kept-note", "b"),
    task("detached", null),
    task("mine", "mine"),
  ];
  assert.deepEqual(reclaimableTaskIds(seeded(), tasks, ["a"]), ["preview"]);
  assert.deepEqual(reclaimableTaskIds(DEFAULT_WORKSPACE_SETTINGS, tasks, ["a"]), []);
  assert.deepEqual(reclaimableTaskIds(forgetSeededNotes(seeded()), tasks, []), []);
  assert.deepEqual(
    reclaimableNoteIds(
      seeded(),
      [
        { id: "a", updatedAt: SEEDED_AT },
        { id: "b", updatedAt: SEEDED_AT },
      ],
      tasks,
    ),
    ["b"],
  );
});
