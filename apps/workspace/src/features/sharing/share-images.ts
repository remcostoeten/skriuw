import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { readNoteImageBlob } from "@/platform/runtime/commands";
import { ShareRequestError } from "./share-api";

export const MAX_SHARED_IMAGES = 20;
export const MAX_SHARED_IMAGE_BYTES = 4 * 1_024 * 1_024;
export const MAX_SHARED_IMAGE_TOTAL_BYTES = 12 * 1_024 * 1_024;
const SHAREABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
// `![alt](images/<id>)`, the form the editor serializes an image reference to.
const IMAGE_REFERENCE = /!\[(?:[^\]\\]|\\.)*\]\(images\/([A-Za-z0-9_-]{1,128})\)/g;
const BASE64_CHUNK = 0x8000;

export type ShareImageUpload = { id: string; mimeType: string; data: string } | { id: string };

type ReadImageBytes = (contentHash: string, mimeType: string) => Promise<ArrayBuffer>;

/**
 * @name shareableImages
 * @description The workspace images a shared note publishes: those its
 * Markdown references, in order, limited to PNG, JPEG, GIF, and WebP and to
 * the server's count and size budget. Anything else stays a placeholder on
 * the public page.
 *
 * @example
 * const images = shareableImages(state.images, note.markdown);
 */
export function shareableImages(
  images: RendererState["images"],
  markdown: string,
): WorkspaceImage[] {
  const selected: WorkspaceImage[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const match of markdown.matchAll(IMAGE_REFERENCE)) {
    const id = match[1] ?? "";
    if (seen.has(id)) continue;
    seen.add(id);
    const image = images.get(id);
    if (
      !image ||
      !SHAREABLE_IMAGE_TYPES.has(image.mimeType) ||
      image.byteSize > MAX_SHARED_IMAGE_BYTES ||
      totalBytes + image.byteSize > MAX_SHARED_IMAGE_TOTAL_BYTES
    ) {
      continue;
    }
    selected.push(image);
    totalBytes += image.byteSize;
    if (selected.length === MAX_SHARED_IMAGES) break;
  }
  return selected;
}

/**
 * @name shareImageUploads
 * @description Builds the `images` field of a share upload. Images the share
 * already stores are sent by id only; the rest are read from the workspace
 * and sent as base64.
 *
 * @example
 * const uploads = await shareImageUploads(note.images, new Set(share.imageIds));
 */
export async function shareImageUploads(
  images: readonly WorkspaceImage[],
  uploaded: ReadonlySet<string>,
  readBytes: ReadImageBytes = readNoteImageBlob,
): Promise<ShareImageUpload[]> {
  return Promise.all(
    images.map(async (image) => {
      if (uploaded.has(image.id)) return { id: image.id };
      const bytes = new Uint8Array(await readBytes(image.contentHash, image.mimeType));
      return { id: image.id, mimeType: image.mimeType, data: bytesToBase64(bytes) };
    }),
  );
}

/**
 * @name sendWithShareImages
 * @description Sends a share upload with its images, skipping the bytes of
 * images the share already stores. When the server no longer has one of
 * them, the upload is retried once with every image's bytes.
 *
 * @example
 * const share = await sendWithShareImages(note.images, new Set(), (images) =>
 *   publishNoteShare({ noteId, title, markdown, live, images }),
 * );
 */
export async function sendWithShareImages<Result>(
  images: readonly WorkspaceImage[],
  uploaded: ReadonlySet<string>,
  send: (uploads: ShareImageUpload[]) => Promise<Result>,
  readBytes: ReadImageBytes = readNoteImageBlob,
): Promise<Result> {
  try {
    return await send(await shareImageUploads(images, uploaded, readBytes));
  } catch (error) {
    if (
      uploaded.size === 0 ||
      !(error instanceof ShareRequestError) ||
      error.code !== "share_image_missing"
    ) {
      throw error;
    }
    return send(await shareImageUploads(images, new Set(), readBytes));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}
