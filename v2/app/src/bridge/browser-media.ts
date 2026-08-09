import type { MediaBlobPayload, StoredImagePayload } from "./commands";

/**
 * Browser-runtime media blob store. Mirrors the desktop `skriuw-images`
 * crate: content-addressed `<sha256-hex>.<ext>` files, format-validated by
 * magic bytes, kept in one flat OPFS directory. Blobs never touch SQLite.
 */
const BLOBS_DIRECTORY = "skriuw-media-blobs";
const SWEEP_MINIMUM_BLOB_AGE_MS = 60_000;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const MIME_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, extension]) => [extension, mime]),
);

/** Must stay in sync with `sniff_mime` in `crates/skriuw-images/src/lib.rs`. */
export function sniffMediaMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWithText(bytes, "GIF87a") || startsWithText(bytes, "GIF89a")) {
    return "image/gif";
  }
  if (bytes.length >= 12 && startsWithText(bytes, "RIFF") && textAt(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && textAt(bytes, 4, 4) === "ftyp") {
    return "video/mp4";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && containsWebmDoctype(bytes)) {
    return "video/webm";
  }
  return null;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function startsWithText(bytes: Uint8Array, text: string): boolean {
  return textAt(bytes, 0, text.length) === text;
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function containsWebmDoctype(bytes: Uint8Array): boolean {
  const haystack = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 64)));
  return haystack.includes("webm");
}

async function blobsDirectory(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator.storage?.getDirectory !== "function") {
    throw new Error("This browser does not support private file storage (OPFS).");
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(BLOBS_DIRECTORY, { create: true });
}

function blobFileName(contentHash: string, mimeType: string): string {
  return `${contentHash}.${EXTENSION_BY_MIME[mimeType] ?? "img"}`;
}

function validateContentHash(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("invalid content hash");
  }
}

async function contentHashOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function storeBrowserMediaBlob(bytes: Uint8Array): Promise<StoredImagePayload> {
  const mimeType = sniffMediaMime(bytes);
  if (!mimeType) {
    throw new Error("unsupported image data");
  }
  const contentHash = await contentHashOf(bytes);
  const directory = await blobsDirectory();
  const handle = await directory.getFileHandle(blobFileName(contentHash, mimeType), {
    create: true,
  });
  const existing = await handle.getFile();
  if (existing.size !== bytes.byteLength) {
    const writable = await handle.createWritable();
    await writable.write(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    await writable.close();
  }
  return { contentHash, mimeType, byteSize: bytes.byteLength };
}

/**
 * Returns the stored blob as a `File` handle. Object URLs made from it
 * stream from disk on demand, so playback never copies the file into memory.
 */
export async function browserMediaFile(
  contentHash: string,
  mimeType: string,
): Promise<File> {
  validateContentHash(contentHash);
  const directory = await blobsDirectory();
  const handle = await directory.getFileHandle(blobFileName(contentHash, mimeType));
  return handle.getFile();
}

export async function readBrowserMediaBlob(
  contentHash: string,
  mimeType: string,
): Promise<ArrayBuffer> {
  const file = await browserMediaFile(contentHash, mimeType);
  return file.arrayBuffer();
}

export async function listBrowserMediaBlobs(): Promise<MediaBlobPayload[]> {
  const directory = await blobsDirectory();
  const entries: MediaBlobPayload[] = [];
  for await (const handle of directory.values()) {
    if (handle.kind !== "file") continue;
    const separator = handle.name.indexOf(".");
    if (separator === -1) continue;
    const contentHash = handle.name.slice(0, separator);
    const mimeType = MIME_BY_EXTENSION[handle.name.slice(separator + 1)];
    if (!mimeType || !/^[0-9a-f]{64}$/.test(contentHash)) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    entries.push({
      contentHash,
      mimeType,
      byteSize: file.size,
      modifiedAtMs: file.lastModified,
    });
  }
  return entries.sort(
    (left, right) =>
      right.modifiedAtMs - left.modifiedAtMs ||
      left.contentHash.localeCompare(right.contentHash),
  );
}

export async function deleteBrowserMediaBlob(
  contentHash: string,
  mimeType: string,
): Promise<void> {
  validateContentHash(contentHash);
  const directory = await blobsDirectory();
  await directory.removeEntry(blobFileName(contentHash, mimeType));
}

/**
 * Deletes blobs whose hash is not in `liveContentHashes`. Files younger than
 * one minute survive, matching the desktop safety margin for blobs written
 * just before their registering operation commits.
 */
export async function sweepBrowserMediaBlobs(
  liveContentHashes: readonly string[],
): Promise<number> {
  const live = new Set(liveContentHashes);
  const now = Date.now();
  let removed = 0;
  for (const entry of await listBrowserMediaBlobs()) {
    if (live.has(entry.contentHash)) continue;
    if (now - entry.modifiedAtMs < SWEEP_MINIMUM_BLOB_AGE_MS) continue;
    await deleteBrowserMediaBlob(entry.contentHash, entry.mimeType);
    removed += 1;
  }
  return removed;
}
