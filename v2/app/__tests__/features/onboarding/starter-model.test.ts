import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../src/features/settings/settings-model";
import {
  completeSeed,
  forgetSeededNotes,
  hasSeededStarter,
  isUnseededFreshWorkspace,
  markSeedSpent,
  reclaimableNoteIds,
  seededNoteIds,
  shouldSeedStarter,
} from "../../../src/features/onboarding/starter-model";

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
  assert.deepEqual(
    reclaimableNoteIds(DEFAULT_WORKSPACE_SETTINGS, [{ id: "a", updatedAt: 1 }]),
    [],
  );
});
