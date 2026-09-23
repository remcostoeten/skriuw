import assert from "node:assert/strict";
import test from "node:test";
import {
  mediaUploadState,
  setMediaUploadState,
  subscribeMediaUploads,
} from "../../../src/features/editor/media-upload-state";

test("upload state notifies subscribers on change and skips no-op clears", () => {
  let calls = 0;
  const unsubscribe = subscribeMediaUploads(() => {
    calls += 1;
  });
  setMediaUploadState("a", { status: "saving", label: "Saving…" });
  assert.equal(mediaUploadState("a")?.status, "saving");
  setMediaUploadState("a", { status: "failed", message: "Storage full", retry: null });
  setMediaUploadState("a", null);
  setMediaUploadState("a", null);
  unsubscribe();
  setMediaUploadState("b", { status: "saving", label: "x" });
  assert.equal(calls, 3);
  assert.equal(mediaUploadState("a"), undefined);
});
