import assert from "node:assert/strict";
import { test } from "vitest";
import {
  blockedCauseText,
  blockedItemLabel,
  blockedItemRetryable,
  blockedStateText,
} from "@/features/settings/sections/sync-recovery";

test("labels a blocked change with its action and note title", () => {
  assert.equal(
    blockedItemLabel({
      operationType: "attach_image",
      targetTitle: "Trip photos",
      targetId: "note-1",
    }),
    "Attach image · Trip photos",
  );
  assert.equal(
    blockedItemLabel({ operationType: "save_document", targetTitle: null, targetId: "note-2" }),
    "Edit note · note-2",
  );
  assert.equal(
    blockedItemLabel({ operationType: "future_operation", targetTitle: null, targetId: null }),
    "future operation",
  );
});

test("explains every known blocked cause and falls back safely", () => {
  const fallback = blockedCauseText("something_new");
  assert.ok(fallback.length > 0);
  const known = ["asset_content_missing", "operation_too_large", "unsupported_operation"].map(
    blockedCauseText,
  );
  for (const text of known) {
    assert.notEqual(text, fallback);
  }
  assert.equal(new Set(known).size, known.length);
});

test("only protocol-permanent causes are unretryable", () => {
  assert.equal(blockedItemRetryable("asset_content_missing"), true);
  assert.equal(blockedItemRetryable("something_new"), true);
  assert.equal(blockedItemRetryable("operation_too_large"), false);
  assert.equal(blockedItemRetryable("unsupported_operation"), false);
});

test("maps whole-queue blocked reasons to actionable copy", () => {
  const fallback = blockedStateText("something_new");
  assert.ok(fallback.length > 0);
  const known = [
    "authorization_denied",
    "push_conflict",
    "protocol_mismatch",
    "rejected_acknowledgement",
    "rejected_checkpoint",
    "storage_failure",
  ].map(blockedStateText);
  for (const text of known) {
    assert.notEqual(text, fallback);
  }
  assert.equal(new Set(known).size, known.length);
  assert.equal(blockedStateText("rejected_batch"), fallback);
});
