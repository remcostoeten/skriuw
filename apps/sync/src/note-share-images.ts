export const MAX_SHARED_IMAGES = 20;
export const MAX_SHARED_IMAGE_BYTES = 4 * 1_024 * 1_024;
export const MAX_SHARED_IMAGE_TOTAL_BYTES = 12 * 1_024 * 1_024;
export const MAX_SHARED_IMAGE_REQUEST_BYTES =
  Math.ceil(MAX_SHARED_IMAGE_TOTAL_BYTES / 3) * 4 + MAX_SHARED_IMAGES * 256;
const MAX_SHARED_IMAGE_BASE64_LENGTH = Math.ceil(MAX_SHARED_IMAGE_BYTES / 3) * 4;
const IMAGE_CACHE_SECONDS = 31_536_000;

export type SharedImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export type SharedImageInput = {
  id: string;
  upload: { contentType: SharedImageType; bytes: Uint8Array } | null;
};

export type SharedImageFailure = { ok: false; status: number; code: string };

type ParsedImages = { ok: true; images: SharedImageInput[] } | SharedImageFailure;
type StoredImages = { ok: true; imageIds: string[] } | SharedImageFailure;

const IMAGE_SIGNATURES: Record<SharedImageType, (bytes: Uint8Array) => boolean> = {
  "image/png": (bytes) => startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (bytes) => startsWith(bytes, 0, [0xff, 0xd8, 0xff]),
  "image/gif": (bytes) =>
    startsWith(bytes, 0, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61,
  "image/webp": (bytes) =>
    startsWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, 8, [0x57, 0x45, 0x42, 0x50]),
};

/**
 * @name parseSharedImages
 * @description Validates the `images` field of a share upload at the Worker
 * boundary. Each entry is either a new upload (`id`, `mimeType`, base64
 * `data`) or a reference to an image this share already stores (`id` only).
 * Only PNG, JPEG, GIF, and WebP are accepted, and the bytes must carry the
 * signature of the declared type, so nothing the browser could sniff as
 * markup is ever stored.
 *
 * @example
 * const parsed = parseSharedImages(body.images);
 * if (!parsed.ok) return errorResponse(parsed.status, parsed.code);
 */
export function parseSharedImages(value: unknown): ParsedImages {
  if (value === undefined) return { ok: true, images: [] };
  if (!Array.isArray(value)) return invalid();
  if (value.length > MAX_SHARED_IMAGES) return { ok: false, status: 413, code: "too_many_images" };
  const images: SharedImageInput[] = [];
  const seen = new Set<string>();
  let uploadedBytes = 0;
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return invalid();
    if (!("id" in entry) || typeof entry.id !== "string" || !isSharedImageId(entry.id)) {
      return invalid();
    }
    if (seen.has(entry.id)) return invalid();
    seen.add(entry.id);
    const keys = Object.keys(entry).length;
    if (keys === 1) {
      images.push({ id: entry.id, upload: null });
      continue;
    }
    if (
      keys !== 3 ||
      !("mimeType" in entry) ||
      !("data" in entry) ||
      typeof entry.mimeType !== "string" ||
      typeof entry.data !== "string"
    ) {
      return invalid();
    }
    const contentType = entry.mimeType;
    if (!isSharedImageType(contentType)) return invalid();
    if (entry.data.length > MAX_SHARED_IMAGE_BASE64_LENGTH) {
      return { ok: false, status: 413, code: "image_too_large" };
    }
    const bytes = decodeBase64(entry.data);
    if (bytes === null || bytes.byteLength === 0) return invalid();
    if (bytes.byteLength > MAX_SHARED_IMAGE_BYTES) {
      return { ok: false, status: 413, code: "image_too_large" };
    }
    if (!IMAGE_SIGNATURES[contentType](bytes)) {
      return { ok: false, status: 400, code: "invalid_image" };
    }
    uploadedBytes += bytes.byteLength;
    if (uploadedBytes > MAX_SHARED_IMAGE_TOTAL_BYTES) {
      return { ok: false, status: 413, code: "images_too_large" };
    }
    images.push({ id: entry.id, upload: { contentType, bytes } });
  }
  return { ok: true, images };
}

/**
 * @name storeSharedImages
 * @description Writes newly uploaded images under the share and confirms
 * that every image referenced by id only is already stored. Nothing is
 * written when a referenced image is missing or the share's images would
 * exceed the per-share byte budget.
 *
 * @example
 * const stored = await storeSharedImages(bucket, shareId, parsed.images);
 */
export async function storeSharedImages(
  bucket: R2Bucket,
  shareId: string,
  images: readonly SharedImageInput[],
): Promise<StoredImages> {
  let totalBytes = 0;
  for (const image of images) {
    if (image.upload) {
      totalBytes += image.upload.bytes.byteLength;
      continue;
    }
    const existing = await bucket.head(sharedImageKey(shareId, image.id));
    if (!existing) return { ok: false, status: 409, code: "share_image_missing" };
    totalBytes += existing.size;
  }
  if (totalBytes > MAX_SHARED_IMAGE_TOTAL_BYTES) {
    return { ok: false, status: 413, code: "images_too_large" };
  }
  for (const image of images) {
    if (!image.upload) continue;
    await bucket.put(sharedImageKey(shareId, image.id), image.upload.bytes, {
      httpMetadata: { contentType: image.upload.contentType },
    });
  }
  return { ok: true, imageIds: images.map((image) => image.id) };
}

/**
 * @name pruneSharedImages
 * @description Deletes every image stored under a share except `keep`. An
 * empty `keep` removes them all, which is how a revoked share is cleaned up.
 *
 * @example
 * await pruneSharedImages(bucket, shareId, new Set(stored.imageIds));
 */
export async function pruneSharedImages(
  bucket: R2Bucket,
  shareId: string,
  keep: ReadonlySet<string>,
): Promise<void> {
  const prefix = sharedImagePrefix(shareId);
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    const stale = page.objects
      .filter((object) => !keep.has(object.key.slice(prefix.length)))
      .map((object) => object.key);
    if (stale.length > 0) await bucket.delete(stale);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/**
 * @name listSharedImageIds
 * @description Lists the ids of the images a share currently stores.
 *
 * @example
 * const imageIds = await listSharedImageIds(bucket, shareId);
 */
export async function listSharedImageIds(bucket: R2Bucket, shareId: string): Promise<string[]> {
  const prefix = sharedImagePrefix(shareId);
  const page = await bucket.list({ prefix, limit: MAX_SHARED_IMAGES });
  return page.objects
    .map((object) => object.key.slice(prefix.length))
    .filter((id) => isSharedImageId(id));
}

/**
 * @name readSharedImage
 * @description Serves one stored share image with its validated content
 * type, `nosniff`, a sandboxing content policy, and a long cache lifetime,
 * since an image id never changes its bytes. Returns null when the share
 * does not store that image.
 *
 * @example
 * const response = await readSharedImage(bucket, shareId, imageId, "GET");
 */
export async function readSharedImage(
  bucket: R2Bucket,
  shareId: string,
  imageId: string,
  method: string,
): Promise<Response | null> {
  const key = sharedImageKey(shareId, imageId);
  if (method === "HEAD") {
    const object = await bucket.head(key);
    return object ? sharedImageResponse(object, null) : null;
  }
  const object = await bucket.get(key);
  return object ? sharedImageResponse(object, object.body) : null;
}

function sharedImageResponse(object: R2Object, body: ReadableStream | null): Response | null {
  const contentType = object.httpMetadata?.contentType;
  if (!contentType || !isSharedImageType(contentType)) return null;
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(object.size),
    "Cache-Control": `public, max-age=${IMAGE_CACHE_SECONDS}, immutable`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
    "X-Robots-Tag": "noindex",
    ETag: object.httpEtag,
  });
  return new Response(body, { headers });
}

/**
 * @name isSharedImageId
 * @description Accepts the image ids a workspace issues (UUIDs and similar
 * URL-safe tokens) and nothing that could escape an object key or a path.
 *
 * @example
 * if (!isSharedImageId(imageId)) return errorResponse(404, "image_not_found");
 */
export function isSharedImageId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isSharedImageType(value: string): value is SharedImageType {
  return Object.hasOwn(IMAGE_SIGNATURES, value);
}

function sharedImagePrefix(shareId: string): string {
  return `note-shares/${shareId}/images/`;
}

function sharedImageKey(shareId: string, imageId: string): string {
  return `${sharedImagePrefix(shareId)}${imageId}`;
}

function decodeBase64(value: string): Uint8Array | null {
  // Canonical padded base64: groups of four, with at most two trailing `=`.
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function startsWith(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function invalid(): SharedImageFailure {
  return { ok: false, status: 400, code: "invalid_request" };
}
