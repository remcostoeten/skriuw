import assert from "node:assert/strict";
import test from "node:test";
import {
  registerImportPreviewListener,
  requestImportPreview,
} from "../../src/import/preview-controller";

test("preview controller returns selected provider and unregisters cleanly", async () => {
  let choose: ((sourceId: string | null) => void) | null = null;
  const unregister = registerImportPreviewListener((request) => {
    assert.equal(request.detectedSourceId, "notion");
    choose = request.resolve;
  });
  const selected = requestImportPreview({
    sourcePath: "/tmp/export.zip",
    detectedSourceId: "notion",
    candidates: [],
  });
  assert.ok(choose);
  (choose as (sourceId: string | null) => void)("markdown");
  assert.equal(await selected, "markdown");

  unregister();
  assert.equal(
    await requestImportPreview({
      sourcePath: "/tmp/export.zip",
      detectedSourceId: "notion",
      candidates: [],
    }),
    null,
  );
});
