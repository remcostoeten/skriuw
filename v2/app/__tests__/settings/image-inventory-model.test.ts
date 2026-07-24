import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceImage } from "../../src/contracts/workspace";
import {
  describeImageUsage,
  imageFormatLabel,
  projectImageInventory,
} from "../../src/settings/image-inventory-model";

function image(overrides: Partial<WorkspaceImage>): WorkspaceImage {
  return {
    id: "image-1",
    noteId: "note-1",
    contentHash: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 2048,
    width: null,
    height: null,
    createdAt: 100,
    ...overrides,
  };
}

const NOTES = new Map([
  ["note-1", { title: "Roadmap" }],
  ["note-2", { title: "Inbox" }],
]);

test("groups image records by content hash and resolves note titles", () => {
  const images = new Map([
    ["image-1", image({ id: "image-1", noteId: "note-1" })],
    ["image-2", image({ id: "image-2", noteId: "note-2", createdAt: 200 })],
    [
      "image-3",
      image({
        id: "image-3",
        noteId: "note-2",
        contentHash: "b".repeat(64),
        mimeType: "image/jpeg",
        byteSize: 512,
        createdAt: 150,
      }),
    ],
  ]);

  const entries = projectImageInventory(images, NOTES);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].contentHash, "a".repeat(64));
  assert.equal(entries[0].referenceCount, 2);
  assert.deepEqual(entries[0].noteTitles, ["Inbox", "Roadmap"]);
  assert.equal(entries[0].latestCreatedAt, 200);
  assert.equal(entries[1].mimeType, "image/jpeg");
  assert.equal(entries[1].byteSize, 512);
});

test("falls back to a placeholder title for unknown notes", () => {
  const images = new Map([["image-1", image({ noteId: "gone" })]]);
  const entries = projectImageInventory(images, NOTES);
  assert.deepEqual(entries[0].noteTitles, ["Untitled note"]);
});

test("describes usage with a truncated note list", () => {
  const single = projectImageInventory(
    new Map([["image-1", image({})]]),
    NOTES,
  );
  assert.equal(describeImageUsage(single[0]), "Used once in Roadmap");

  const entry = {
    contentHash: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 1,
    referenceCount: 5,
    noteTitles: ["A", "B", "C", "D", "E"],
    latestCreatedAt: 1,
  };
  assert.equal(describeImageUsage(entry), "Used 5 times in A, B, C and 2 more");
});

test("labels known formats and falls back for unknown mime types", () => {
  assert.equal(imageFormatLabel("image/png"), "PNG");
  assert.equal(imageFormatLabel("image/webp"), "WebP");
  assert.equal(imageFormatLabel("application/octet-stream"), "Image");
});
