import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedCauseText,
  blockedItemLabel,
  blockedItemRetryable,
  blockedStateText,
} from "../../../../src/features/settings/sections/sync-recovery";

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
  for (const reason of [
    "asset_content_missing",
    "operation_too_large",
    "unsupported_operation",
    "something_new",
  ]) {
    assert.ok(blockedCauseText(reason).length > 0);
  }
});

test("only protocol-permanent causes are unretryable", () => {
  assert.equal(blockedItemRetryable("asset_content_missing"), true);
  assert.equal(blockedItemRetryable("something_new"), true);
  assert.equal(blockedItemRetryable("operation_too_large"), false);
  assert.equal(blockedItemRetryable("unsupported_operation"), false);
});

test("maps whole-queue blocked reasons to actionable copy", () => {
  for (const reason of [
    "authorization_denied",
    "push_conflict",
    "protocol_mismatch",
    "rejected_acknowledgement",
    "rejected_checkpoint",
    "storage_failure",
    "rejected_batch",
  ]) {
    assert.ok(blockedStateText(reason).length > 0);
  }
});
