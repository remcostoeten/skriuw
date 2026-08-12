import assert from "node:assert/strict";
import test from "node:test";
import { collectImageFiles } from "../../../src/features/editor/image-input";

function file(name: string, type: string): File {
  return { name, type } as File;
}

function transfer(files: readonly File[], items: readonly DataTransferItem[]): DataTransfer {
  return { files, items } as unknown as DataTransfer;
}

function item(kind: DataTransferItem["kind"], type: string, value: File | null): DataTransferItem {
  return {
    kind,
    type,
    getAsFile: () => value,
  } as DataTransferItem;
}

test("collectImageFiles reads clipboard image items when the file list is empty", () => {
  const pasted = file("clipboard.png", "image/png");
  const result = collectImageFiles(
    transfer([], [
      item("string", "text/html", null),
      item("file", "image/png", pasted),
    ]),
  );

  assert.deepEqual(result, [pasted]);
});

test("collectImageFiles ignores non-image and unavailable clipboard items", () => {
  const document = file("notes.txt", "text/plain");
  const result = collectImageFiles(
    transfer([], [
      item("file", "text/plain", document),
      item("file", "image/png", null),
    ]),
  );

  assert.deepEqual(result, []);
});

test("collectImageFiles falls back to transfer files for image drops", () => {
  const dropped = file("photo.webp", "image/webp");
  const document = file("notes.txt", "text/plain");

  assert.deepEqual(collectImageFiles(transfer([document, dropped], [])), [dropped]);
});

test("collectImageFiles does not duplicate files exposed in items and files", () => {
  const pasted = file("clipboard.png", "image/png");

  assert.deepEqual(
    collectImageFiles(transfer([pasted], [item("file", "image/png", pasted)])),
    [pasted],
  );
});
