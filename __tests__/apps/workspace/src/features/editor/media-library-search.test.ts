import assert from "node:assert/strict";
import { test } from "vitest";
import { filterLibraryMedia } from "@/features/editor/media-library-search";

const blobs = [
  { contentHash: "aaa111", mimeType: "image/png", byteSize: 10, modifiedAtMs: 1 },
  { contentHash: "bbb222", mimeType: "image/jpeg", byteSize: 10, modifiedAtMs: 3 },
  { contentHash: "ccc333", mimeType: "video/mp4", byteSize: 10, modifiedAtMs: 2 },
];

const metadata = new Map([
  ["aaa111", { contentHash: "aaa111", name: "Beach sunset", alt: "", updatedAt: 0 }],
  ["bbb222", { contentHash: "bbb222", name: "", alt: "A red bicycle", updatedAt: 0 }],
]);

test("lists only the requested kind, newest first", () => {
  assert.deepEqual(
    filterLibraryMedia(blobs, "image", "").map((blob) => blob.contentHash),
    ["bbb222", "aaa111"],
  );
  assert.deepEqual(
    filterLibraryMedia(blobs, "video", "").map((blob) => blob.contentHash),
    ["ccc333"],
  );
});

test("matches the name and alt text people gave an asset", () => {
  assert.deepEqual(
    filterLibraryMedia(blobs, "image", "sunset", metadata).map((blob) => blob.contentHash),
    ["aaa111"],
  );
  assert.deepEqual(
    filterLibraryMedia(blobs, "image", "BICYCLE", metadata).map((blob) => blob.contentHash),
    ["bbb222"],
  );
});

test("still matches format and hash without metadata", () => {
  assert.deepEqual(
    filterLibraryMedia(blobs, "image", "jpeg").map((blob) => blob.contentHash),
    ["bbb222"],
  );
  assert.deepEqual(
    filterLibraryMedia(blobs, "image", "aaa1").map((blob) => blob.contentHash),
    ["aaa111"],
  );
});
