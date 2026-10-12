import { describe, expect, it } from "vitest";
import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import { ShareRequestError } from "@/features/sharing/share-api";
import {
  MAX_SHARED_IMAGES,
  MAX_SHARED_IMAGE_BYTES,
  MAX_SHARED_IMAGE_TOTAL_BYTES,
  type ShareImageUpload,
  sendWithShareImages,
  shareImageUploads,
  shareableImages,
} from "@/features/sharing/share-images";

function image(id: string, mimeType = "image/png", byteSize = 3): WorkspaceImage {
  return {
    id,
    noteId: "open",
    contentHash: `hash-${id}`,
    mimeType,
    byteSize,
    width: null,
    height: null,
    createdAt: 1,
  };
}

function imageMap(images: WorkspaceImage[]) {
  return new Map(images.map((entry) => [entry.id, entry]));
}

async function readBytes(contentHash: string) {
  return new TextEncoder().encode(contentHash).buffer;
}

function references(ids: string[]) {
  return ids.map((id) => `![](images/${id})`).join("\n");
}

describe("shareableImages", () => {
  it("publishes referenced raster images once, in note order", () => {
    const images = imageMap([
      image("a"),
      image("b", "image/jpeg"),
      image("svg", "image/svg+xml"),
      image("clip", "video/mp4"),
      image("unused"),
    ]);
    const markdown = [
      "![B \\] alt](images/b)",
      "![A](images/a) ![again](images/a)",
      "![S](images/svg)",
      "[Clip](images/clip)<!--skriuw-media:video-->",
      "![gone](images/missing)",
    ].join("\n\n");
    expect(shareableImages(images, markdown).map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("skips images over the per-image and total budgets and stops at the count limit", () => {
    const big = image("big", "image/png", MAX_SHARED_IMAGE_BYTES + 1);
    const quarter = MAX_SHARED_IMAGE_TOTAL_BYTES / 4;
    const fill = ["f1", "f2", "f3", "f4", "f5"].map((id) => image(id, "image/png", quarter));
    const selected = shareableImages(
      imageMap([big, ...fill]),
      references(["big", ...fill.map((entry) => entry.id)]),
    );
    expect(selected.map((entry) => entry.id)).toEqual(["f1", "f2", "f3", "f4"]);

    const many = Array.from({ length: MAX_SHARED_IMAGES + 5 }, (_, index) => image(`i${index}`));
    expect(shareableImages(imageMap(many), references(many.map((entry) => entry.id)))).toHaveLength(
      MAX_SHARED_IMAGES,
    );
  });
});

describe("shareImageUploads", () => {
  it("sends stored images by id and the rest as base64", async () => {
    const uploads = await shareImageUploads([image("a"), image("b")], new Set(["a"]), readBytes);
    expect(uploads).toEqual([
      { id: "a" },
      { id: "b", mimeType: "image/png", data: btoa("hash-b") },
    ]);
  });
});

describe("sendWithShareImages", () => {
  it("retries once with every image's bytes when the server lost one", async () => {
    const attempts: ShareImageUpload[][] = [];
    const result = await sendWithShareImages(
      [image("a")],
      new Set(["a"]),
      async (uploads) => {
        attempts.push(uploads);
        if (attempts.length === 1) throw new ShareRequestError("share_image_missing", "missing");
        return "sent";
      },
      readBytes,
    );
    expect(result).toBe("sent");
    expect(attempts).toEqual([
      [{ id: "a" }],
      [{ id: "a", mimeType: "image/png", data: btoa("hash-a") }],
    ]);
  });

  it("does not retry other failures", async () => {
    let calls = 0;
    await expect(
      sendWithShareImages(
        [image("a")],
        new Set(["a"]),
        async () => {
          calls += 1;
          throw new ShareRequestError("note_too_large", "too large");
        },
        readBytes,
      ),
    ).rejects.toThrow("too large");
    expect(calls).toBe(1);
  });
});
