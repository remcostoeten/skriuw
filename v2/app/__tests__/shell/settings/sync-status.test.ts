import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSyncStatus } from "../../../src/bridge/commands";
import {
  syncDescription,
  syncEnabled,
  syncProgressText,
  syncProgressVisible,
  syncSummary,
  syncTone,
} from "../../../src/shell/settings/sync-status";

const EVERY_STATE: WorkspaceSyncStatus[] = [
  { state: "localOnly" },
  { state: "connecting" },
  { state: "upToDate" },
  { state: "pending" },
  { state: "offline" },
  { state: "authenticationRequired" },
  { state: "conflict", openConflicts: 2 },
  { state: "retrying" },
  { state: "blocked", reason: "rejected_batch" },
];

test("browser sync is no longer described as desktop-only", () => {
  for (const status of EVERY_STATE) {
    const text = syncDescription(status, true);
    assert.ok(text.length > 0);
    assert.ok(!text.includes("stay fully local"));
  }
  assert.equal(syncDescription({ state: "localOnly" }, true), syncDescription({ state: "localOnly" }, false));
  assert.equal(syncDescription({ state: "upToDate" }, true), syncDescription({ state: "upToDate" }, false));
});

test("a rejected browser session lands in a recoverable authenticationRequired description", () => {
  const status: WorkspaceSyncStatus = { state: "authenticationRequired" };
  assert.equal(syncEnabled(status), false);
  const text = syncDescription(status, true);
  assert.ok(text.includes("sign in"));
  assert.ok(text.includes("reconnect"));
});

test("a signed-in device that is local-only reads as paused, not as an unfinished setup step", () => {
  const text = syncDescription({ state: "localOnly" }, false);
  assert.ok(text.startsWith("Paused."));
  assert.ok(text.includes("resume sync"));
});

test("browser blocked copy never points at the desktop-only blocked list", () => {
  for (const reason of [
    "authorization_denied",
    "rejected_acknowledgement",
    "rejected_checkpoint",
    "rejected_batch",
  ]) {
    const text = syncDescription({ state: "blocked", reason }, true);
    assert.ok(!text.toLowerCase().includes("below"));
    assert.ok(text.includes("Retry sync"));
  }
  for (const reason of ["push_conflict", "protocol_mismatch", "storage_failure"]) {
    assert.equal(
      syncDescription({ state: "blocked", reason }, true),
      syncDescription({ state: "blocked", reason }, false),
    );
  }
});

test("sync is enabled for every linked state and disabled otherwise", () => {
  for (const status of EVERY_STATE) {
    const expected = status.state !== "localOnly" && status.state !== "authenticationRequired";
    assert.equal(syncEnabled(status), expected);
  }
});

test("progress stays visible only while a cycle can still run", () => {
  assert.equal(syncProgressVisible({ state: "connecting" }, false), true);
  assert.equal(syncProgressVisible({ state: "pending" }, false), true);
  assert.equal(syncProgressVisible({ state: "localOnly" }, true), true);
  assert.equal(syncProgressVisible({ state: "upToDate" }, false), false);
  assert.equal(syncProgressVisible({ state: "blocked", reason: "rejected_checkpoint" }, false), false);
  assert.equal(syncProgressVisible({ state: "authenticationRequired" }, false), false);
});

test("hydration progress reads totals from the checkpoint manifest", () => {
  assert.equal(
    syncProgressText({
      phase: "hydrating",
      transferredChunks: 3,
      transferredBytes: 3 * 1024 * 1024,
      expectedChunks: 12,
      expectedBytes: 12 * 1024 * 1024,
    }),
    "Setting up this device from your cloud workspace: 3.0 MB of 12.0 MB (3 of 12 chunks).",
  );
});

test("transfer progress without known totals still reports movement", () => {
  assert.equal(
    syncProgressText({
      phase: "downloading",
      transferredChunks: 1,
      transferredBytes: 512,
      expectedChunks: null,
      expectedBytes: null,
    }),
    "Downloading changes: 512 Bytes (1 chunk).",
  );
  assert.equal(
    syncProgressText({
      phase: "uploading",
      transferredChunks: 2,
      transferredBytes: 2048,
      expectedChunks: null,
      expectedBytes: null,
    }),
    "Uploading changes: 2.0 KB (2 chunks).",
  );
});

test("every sync state has a short menu summary that fits one line", () => {
  for (const status of EVERY_STATE) {
    const text = syncSummary(status);
    assert.ok(text.length > 0);
    assert.ok(text.length <= 34, `${status.state} summary is too long for the menu: ${text}`);
    assert.ok(!text.includes("."), `${status.state} summary should not read as prose: ${text}`);
  }
});

test("a paused workspace never reads as synced in the menu", () => {
  assert.equal(syncTone({ state: "localOnly" }), "offline");
  assert.match(syncSummary({ state: "localOnly" }), /paused/i);
});

test("states needing the user read as attention, not as a healthy dot", () => {
  for (const status of EVERY_STATE) {
    const tone = syncTone(status);
    const needsUser =
      status.state === "authenticationRequired" ||
      status.state === "conflict" ||
      status.state === "retrying" ||
      status.state === "blocked";
    assert.equal(tone === "attention", needsUser, `${status.state} tone was ${tone}`);
    if (needsUser) {
      assert.notEqual(tone, "synced");
    }
  }
  assert.equal(syncTone({ state: "upToDate" }), "synced");
  assert.equal(syncTone({ state: "pending" }), "syncing");
  assert.equal(syncTone({ state: "connecting" }), "syncing");
});

test("conflict counts are pluralised in the menu summary", () => {
  assert.equal(syncSummary({ state: "conflict", openConflicts: 1 }), "1 conflict needs attention");
  assert.equal(syncSummary({ state: "conflict", openConflicts: 3 }), "3 conflicts need attention");
});
