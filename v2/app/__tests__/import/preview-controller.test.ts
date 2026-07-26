import assert from "node:assert/strict";
import test from "node:test";
import {
  registerImportPreviewListener,
  requestImportPreview,
} from "../../src/import/preview-controller";

test("preview controller returns selected provider and unregisters cleanly", async () => {
  let choose: Parameters<
    Parameters<typeof registerImportPreviewListener>[0]
  >[0]["resolve"] | null = null;
  const unregister = registerImportPreviewListener((request) => {
    assert.equal(request.detectedSourceId, "notion");
    choose = request.resolve;
  });
  const selected = requestImportPreview({
    sourcePath: "/tmp/export.zip",
    detectedSourceId: "notion",
    candidates: [],
    destinations: [{ id: null, label: "Workspace root" }],
  });
  assert.ok(choose);
  const selection = {
    sourceId: "markdown",
    destinationFolderId: "folder-1",
    duplicateMode: "update" as const,
  };
  choose(selection);
  assert.deepEqual(await selected, selection);

  unregister();
  assert.equal(
    await requestImportPreview({
      sourcePath: "/tmp/export.zip",
      detectedSourceId: "notion",
      candidates: [],
      destinations: [],
    }),
    null,
  );
});
