import assert from "node:assert/strict";
import { test } from "vitest";
import {
  collectImageFiles,
  describeMediaFailure,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  mediaFileProblem,
} from "@/features/editor/image-input";
import { UnsupportedMediaError } from "@/bridge/browser-media";

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
    transfer([], [item("string", "text/html", null), item("file", "image/png", pasted)]),
  );

  assert.deepEqual(result, [pasted]);
});

test("collectImageFiles ignores non-image and unavailable clipboard items", () => {
  const document = file("notes.txt", "text/plain");
  const result = collectImageFiles(
    transfer([], [item("file", "text/plain", document), item("file", "image/png", null)]),
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

  assert.deepEqual(collectImageFiles(transfer([pasted], [item("file", "image/png", pasted)])), [
    pasted,
  ]);
});

function sized(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

test("mediaFileProblem rejects HEIC before reading bytes", () => {
  assert.match(mediaFileProblem(sized("IMG_0001.HEIC", "", 10)) ?? "", /Convert to JPEG/);
  assert.match(mediaFileProblem(sized("photo", "image/heif", 10)) ?? "", /Convert to JPEG/);
});

test("mediaFileProblem caps images and videos at their own limits", () => {
  assert.equal(mediaFileProblem(sized("a.png", "image/png", MAX_IMAGE_BYTES)), null);
  assert.match(mediaFileProblem(sized("a.png", "image/png", MAX_IMAGE_BYTES + 1)) ?? "", /limit/);
  assert.equal(mediaFileProblem(sized("a.mov", "video/quicktime", MAX_IMAGE_BYTES + 1)), null);
  assert.match(mediaFileProblem(sized("a.mp4", "video/mp4", MAX_VIDEO_BYTES + 1)) ?? "", /video/);
});

test("describeMediaFailure names a full disk and unsupported formats", () => {
  const quota = new Error("write failed");
  quota.name = "QuotaExceededError";
  assert.equal(describeMediaFailure(quota).title, "Storage full");
  assert.equal(
    describeMediaFailure(new UnsupportedMediaError("HEIC photos aren’t supported")).message,
    "HEIC photos aren’t supported",
  );
  assert.equal(describeMediaFailure(new Error("boom")).title, "Couldn’t save media");
});
