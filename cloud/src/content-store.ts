import {
  CANONICAL_CHUNK_BYTES,
  CONTENT_DIGEST_HEX_BYTES,
  type ContentManifest,
} from "./contracts";

export type ContentStoreFailure =
  | "chunk_digest_mismatch"
  | "chunk_too_large"
  | "chunk_empty"
  | "chunk_not_found";

export type ChunkWriteResult =
  | { ok: true; created: boolean }
  | { ok: false; code: ContentStoreFailure };

export type ChunkReadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: ContentStoreFailure };

/**
 * Chunk keys are workspace-scoped. Two workspaces holding identical bytes keep
 * independent objects, so deduplication is workspace-scoped by construction and
 * a caller can never probe another workspace's content by guessing a digest.
 */
export function chunkKey(workspaceId: string, digest: string): string {
  return `workspaces/${workspaceId}/chunks/${digest}`;
}

export function isContentDigest(value: string): boolean {
  return (
    value.length === CONTENT_DIGEST_HEX_BYTES && /^[0-9a-f]+$/.test(value)
  );
}

export async function contentDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class WorkspaceContentStore {
  constructor(private readonly bucket: R2Bucket) {}

  /**
   * Stores a chunk only when the received bytes hash to the requested digest.
   * A client-supplied digest is never trusted as an object key.
   */
  async putChunk(
    workspaceId: string,
    digest: string,
    bytes: Uint8Array,
  ): Promise<ChunkWriteResult> {
    if (bytes.byteLength === 0) {
      return { ok: false, code: "chunk_empty" };
    }
    if (bytes.byteLength > CANONICAL_CHUNK_BYTES) {
      return { ok: false, code: "chunk_too_large" };
    }
    if ((await contentDigest(bytes)) !== digest) {
      return { ok: false, code: "chunk_digest_mismatch" };
    }

    const key = chunkKey(workspaceId, digest);
    const existing = await this.bucket.head(key);
    if (existing !== null) {
      return { ok: true, created: false };
    }
    await this.bucket.put(key, bytes);
    return { ok: true, created: true };
  }

  async hasChunk(workspaceId: string, digest: string): Promise<boolean> {
    return (await this.bucket.head(chunkKey(workspaceId, digest))) !== null;
  }

  async getChunk(workspaceId: string, digest: string): Promise<ChunkReadResult> {
    const object = await this.bucket.get(chunkKey(workspaceId, digest));
    if (object === null) {
      return { ok: false, code: "chunk_not_found" };
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if ((await contentDigest(bytes)) !== digest) {
      return { ok: false, code: "chunk_digest_mismatch" };
    }
    return { ok: true, bytes };
  }

  /**
   * Reports the manifest chunks that are not yet stored, so an interrupted
   * upload resumes by sending only what is missing.
   */
  async missingChunks(
    workspaceId: string,
    manifest: ContentManifest,
  ): Promise<string[]> {
    const digests = [...new Set(manifest.chunks.map((chunk) => chunk.digest))];
    const present = await Promise.all(
      digests.map(async (digest) => ({
        digest,
        stored: await this.hasChunk(workspaceId, digest),
      })),
    );
    return present.filter((entry) => !entry.stored).map((entry) => entry.digest);
  }

  async deleteChunks(workspaceId: string, digests: readonly string[]): Promise<void> {
    if (digests.length === 0) {
      return;
    }
    await this.bucket.delete(digests.map((digest) => chunkKey(workspaceId, digest)));
  }
}
