import assert from "node:assert/strict";
import test from "node:test";
import type { MediaBlobPayload } from "../../../src/bridge/commands";
import type { WorkspaceImage } from "../../../src/contracts/workspace";
import {
  projectCoverMediaPicker,
  type CoverMediaPickerSort,
} from "../../../src/features/settings/cover-media-picker-model";

function blob(
  contentHash: string,
  overrides: Partial<MediaBlobPayload> = {},
): MediaBlobPayload {
  return {
    contentHash,
    mimeType: "image/png",
    byteSize: 1024,
    modifiedAtMs: 100,
    ...overrides,
  };
}

function image(
  id: string,
  contentHash: string,
  overrides: Partial<WorkspaceImage> = {},
): WorkspaceImage {
  return {
    id,
    noteId: `note-${id}`,
    contentHash,
    mimeType: "image/png",
    byteSize: 1024,
    width: null,
    height: null,
    createdAt: 100,
    ...overrides,
  };
}

const BLOBS = [
  blob("alpha", { byteSize: 100, modifiedAtMs: 100 }),
  blob("beta", { byteSize: 300, modifiedAtMs: 200, mimeType: "image/jpeg" }),
  blob("gamma", { byteSize: 200, modifiedAtMs: 300 }),
];

const IMAGES = new Map([
  ["first", image("first", "alpha", { noteId: "roadmap", createdAt: 300 })],
  ["second", image("second", "alpha", { noteId: "inbox", createdAt: 100 })],
  ["third", image("third", "beta", { noteId: "roadmap", createdAt: 200 })],
]);

test("derives stable usage, duplicate, and reference metadata", () => {
  const items = projectCoverMediaPicker(BLOBS, IMAGES);
  const alpha = items.find((item) => item.contentHash === "alpha");
  const gamma = items.find((item) => item.contentHash === "gamma");

  assert.deepEqual(alpha, {
    contentHash: "alpha",
    mimeType: "image/png",
    byteSize: 100,
    modifiedAtMs: 100,
    usageCount: 2,
    referenceIds: ["second", "first"],
    noteIds: ["inbox", "roadmap"],
    isUsed: true,
    isDuplicate: true,
    isCurrent: false,
  });
  assert.equal(gamma?.usageCount, 0);
  assert.equal(gamma?.isUsed, false);
  assert.equal(gamma?.isDuplicate, false);
});

test("resolves current asset from hash or image ID and pins it first", () => {
  const byId = projectCoverMediaPicker(BLOBS, IMAGES, {
    currentCoverImageId: "first",
  });
  assert.equal(byId[0].contentHash, "alpha");
  assert.equal(byId[0].isCurrent, true);

  const byHash = projectCoverMediaPicker(BLOBS, IMAGES, {
    currentCoverContentHash: "beta",
    currentCoverImageId: "first",
  });
  assert.equal(byHash[0].contentHash, "beta");
  assert.equal(byHash[0].isCurrent, true);
  assert.equal(byHash.filter((item) => item.isCurrent).length, 1);
});

test("finds assets by hash, MIME type, reference ID, or note ID", () => {
  assert.deepEqual(
    projectCoverMediaPicker(BLOBS, IMAGES, { query: "JPEG" }).map(
      (item) => item.contentHash,
    ),
    ["beta"],
  );
  assert.deepEqual(
    projectCoverMediaPicker(BLOBS, IMAGES, { query: "second" }).map(
      (item) => item.contentHash,
    ),
    ["alpha"],
  );
  assert.deepEqual(
    projectCoverMediaPicker(BLOBS, IMAGES, { query: "ROADMAP" }).map(
      (item) => item.contentHash,
    ),
    ["beta", "alpha"],
  );
});

test("filters used, unused, and duplicate assets", () => {
  assert.deepEqual(
    projectCoverMediaPicker(BLOBS, IMAGES, { filter: "used" }).map(
      (item) => item.contentHash,
    ),
    ["beta", "alpha"],
  );
  assert.deepEqual(
    projectCoverMediaPicker(BLOBS, IMAGES, { filter: "unused" }).map(
      (item) => item.contentHash,
    ),
    ["gamma"],
  );
  assert.deepEqual(
    projectCoverMediaPicker(BLOBS, IMAGES, { filter: "duplicates" }).map(
      (item) => item.contentHash,
    ),
    ["alpha"],
  );
});

test("sorts by recent, size, or usage with deterministic ties", () => {
  const hashes = (sort: CoverMediaPickerSort) =>
    projectCoverMediaPicker(BLOBS, IMAGES, { sort }).map(
      (item) => item.contentHash,
    );

  assert.deepEqual(hashes("recent"), ["gamma", "beta", "alpha"]);
  assert.deepEqual(hashes("size"), ["beta", "gamma", "alpha"]);
  assert.deepEqual(hashes("usage"), ["alpha", "beta", "gamma"]);

  const tied = [
    blob("zeta", { modifiedAtMs: 1 }),
    blob("delta", { modifiedAtMs: 1 }),
  ];
  assert.deepEqual(
    projectCoverMediaPicker(tied, new Map()).map((item) => item.contentHash),
    ["delta", "zeta"],
  );
});

test("does not mutate source arrays or workspace images", () => {
  const blobs = [...BLOBS];
  const first = IMAGES.get("first");

  projectCoverMediaPicker(blobs, IMAGES, { sort: "usage" });

  assert.deepEqual(blobs, BLOBS);
  assert.equal(IMAGES.get("first"), first);
});
