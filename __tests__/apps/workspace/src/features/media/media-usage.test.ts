import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { mediaEntryForContentHash, mediaUsageDetail } from "@/features/media/media-usage";

function image(id: string, noteId: string): WorkspaceImage {
  return {
    id,
    noteId,
    contentHash: "hash-a",
    mimeType: "image/png",
    byteSize: 2048,
    width: 800,
    height: 600,
    createdAt: 1_700_000_000_000,
  } as WorkspaceImage;
}

function documentWith(imageId: string) {
  return {
    documentJson: { type: "doc", content: [{ type: "image_ref", attrs: { id: imageId } }] },
  };
}

test("an image shows every note that references its file, with its library name", () => {
  const state = {
    images: new Map([
      ["img-1", image("img-1", "note-1")],
      ["img-2", image("img-2", "note-2")],
    ]),
    nodes: new Map([
      ["note-1", { title: "Alpha", parentId: null }],
      ["note-2", { title: "Beta", parentId: null }],
    ]),
    documents: new Map([
      ["note-1", documentWith("img-1")],
      ["note-2", documentWith("img-2")],
    ]),
    mediaMetadata: new Map([
      ["hash-a", { contentHash: "hash-a", name: "Diagram", alt: "", updatedAt: 0 }],
    ]),
  } as unknown as Pick<RendererState, "images" | "nodes" | "documents" | "mediaMetadata">;

  const entry = mediaEntryForContentHash(state, "hash-a");
  assert.equal(entry?.name, "Diagram");
  assert.deepEqual(
    entry?.usages.map((usage) => usage.title),
    ["Alpha", "Beta"],
  );
  assert.equal(mediaEntryForContentHash(state, "missing"), null);
});

test("usage details name the surface, placement and repeat count", () => {
  assert.equal(
    mediaUsageDetail({ noteId: "n", title: "t", count: 2, surface: "journal", placement: "cover" }),
    "Journal cover ×2",
  );
  assert.equal(
    mediaUsageDetail({ noteId: "n", title: "t", count: 1, surface: "note", placement: "inline" }),
    "inline",
  );
});
