import assert from "node:assert/strict";
import test from "node:test";
import type { MediaBlobPayload } from "../../src/bridge/commands";
import type { WorkspaceImage } from "../../src/contracts/workspace";
import {
  countUnusedMedia,
  describeMediaUsage,
  imageFormatLabel,
  isUnusedMedia,
  projectMediaLibrary,
} from "../../src/settings/media-library-model";

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

function blob(overrides: Partial<MediaBlobPayload>): MediaBlobPayload {
  return {
    contentHash: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 2048,
    modifiedAtMs: 100,
    ...overrides,
  };
}

const NOTES = new Map([
  ["note-1", { title: "Roadmap", parentId: null }],
  ["note-2", { title: "Inbox", parentId: null }],
]);

function documents(entries: Record<string, string[]>) {
  return new Map(
    Object.entries(entries).map(([noteId, ids]) => [
      noteId,
      {
        documentJson: {
          type: "doc",
          content: ids.map((id) => ({ type: "image_ref", attrs: { id } })),
        },
      },
    ]),
  );
}

test("merges disk blobs with per-note usage counts", () => {
  const blobs = [
    blob({}),
    blob({ contentHash: "b".repeat(64), mimeType: "image/jpeg", byteSize: 512, modifiedAtMs: 300 }),
  ];
  const images = new Map([
    ["image-1", image({ id: "image-1", noteId: "note-1" })],
    ["image-2", image({ id: "image-2", noteId: "note-1", createdAt: 200 })],
    ["image-3", image({ id: "image-3", noteId: "note-2", createdAt: 150 })],
  ]);

  const entries = projectMediaLibrary(
    blobs,
    images,
    NOTES,
    documents({ "note-1": ["image-1", "image-2"], "note-2": ["image-3"] }),
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0].contentHash, "b".repeat(64));
  assert.deepEqual(entries[0].usages, []);
  assert.ok(isUnusedMedia(entries[0]));

  assert.equal(entries[1].contentHash, "a".repeat(64));
  assert.equal(entries[1].modifiedAt, 200);
  assert.deepEqual(entries[1].usages, [
    {
      noteId: "note-2",
      title: "Inbox",
      count: 1,
      surface: "note",
      placement: "inline",
    },
    {
      noteId: "note-1",
      title: "Roadmap",
      count: 2,
      surface: "note",
      placement: "inline",
    },
  ]);
  assert.equal(countUnusedMedia(entries), 1);
});

test("keeps referenced images whose blob file is gone and flags them", () => {
  const images = new Map([["image-1", image({})]]);
  const entries = projectMediaLibrary(
    [],
    images,
    NOTES,
    documents({ "note-1": ["image-1"] }),
  );
  assert.equal(entries.length, 1);
  assert.ok(entries[0].missingBlob);
  assert.deepEqual(entries[0].usages, [
    {
      noteId: "note-1",
      title: "Roadmap",
      count: 1,
      surface: "note",
      placement: "inline",
    },
  ]);
});

test("falls back to a placeholder title for unknown notes", () => {
  const images = new Map([["image-1", image({ noteId: "gone" })]]);
  const entries = projectMediaLibrary(
    [blob({})],
    images,
    new Map(),
    documents({ gone: ["image-1"] }),
  );
  assert.equal(entries[0].usages[0].title, "Untitled note");
});

test("describes usage including the unused case", () => {
  const unused = projectMediaLibrary([blob({})], new Map(), NOTES);
  assert.equal(describeMediaUsage(unused[0]), "Not used in any note");

  const single = projectMediaLibrary(
    [blob({})],
    new Map([["image-1", image({})]]),
    NOTES,
    documents({ "note-1": ["image-1"] }),
  );
  assert.equal(describeMediaUsage(single[0]), "Used once in Roadmap (inline)");

  const entry = {
    contentHash: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 1,
    modifiedAt: 1,
    createdAt: 1,
    width: null,
    height: null,
    missingBlob: false,
    usages: ["A", "B", "C", "D", "E"].map((title, index) => ({
      noteId: `note-${index}`,
      title,
      count: 1,
      surface: "note" as const,
      placement: "inline" as const,
    })),
  };
  assert.equal(
    describeMediaUsage(entry),
    "Used 5 times in A (inline), B (inline), C (inline) and 2 more",
  );
});

test("classifies note covers and journal references", () => {
  const cover = image({ id: "cover", noteId: "note-1", width: 1600, height: 900 });
  const journal = image({ id: "journal-image", noteId: "journal-1" });
  const nodes = new Map([
    [
      "note-1",
      { title: "Roadmap", parentId: null, coverImageId: "cover" },
    ],
    [
      "journal-1",
      { title: "2026-07-29", parentId: "journal-root", coverImageId: null },
    ],
  ]);
  const entries = projectMediaLibrary(
    [blob({})],
    new Map([
      ["cover", cover],
      ["journal-image", journal],
    ]),
    nodes,
    documents({ "journal-1": ["journal-image"] }),
  );
  assert.deepEqual(entries[0].usages, [
    {
      noteId: "journal-1",
      title: "2026-07-29",
      count: 1,
      surface: "journal",
      placement: "inline",
    },
    {
      noteId: "note-1",
      title: "Roadmap",
      count: 1,
      surface: "note",
      placement: "cover",
    },
  ]);
  assert.equal(entries[0].width, 1600);
  assert.equal(entries[0].height, 900);
});

test("labels known formats and falls back for unknown mime types", () => {
  assert.equal(imageFormatLabel("image/png"), "PNG");
  assert.equal(imageFormatLabel("image/webp"), "WebP");
  assert.equal(imageFormatLabel("application/octet-stream"), "Image");
});
