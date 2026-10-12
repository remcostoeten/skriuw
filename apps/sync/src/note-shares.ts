import {
  type SyncAccessConfiguration,
  type SyncAccessFailureCode,
  authenticateSyncRequest,
} from "./access";
import { readBoundedBytes } from "./bounded-body";
import {
  MAX_SHARED_IMAGE_REQUEST_BYTES,
  type SharedImageInput,
  isSharedImageId,
  listSharedImageIds,
  parseSharedImages,
  pruneSharedImages,
  readSharedImage,
  storeSharedImages,
} from "./note-share-images";

export const MAX_SHARED_MARKDOWN_BYTES = 512 * 1_024;
export const MAX_SHARED_TITLE_LENGTH = 500;
export const MAX_SHARES_PER_ACCOUNT = 500;
const MAX_SHARE_BODY_BYTES = MAX_SHARED_MARKDOWN_BYTES + MAX_SHARED_IMAGE_REQUEST_BYTES + 8 * 1_024;
const PUBLIC_CACHE_SECONDS = 30;

type ShareDependencies = {
  accessConfiguration: SyncAccessConfiguration;
  database: D1Database;
  images: R2Bucket;
  publicOrigin: string;
  nowEpochSeconds(): number;
  newShareId(): string;
};

type ShareContent = {
  noteId: string;
  title: string;
  markdown: string;
  live: boolean;
  images: SharedImageInput[];
};

type ShareRow = {
  id: string;
  note_id: string;
  title: string;
  markdown: string;
  live: number;
  created_at: number;
  updated_at: number;
};

type ShareBodyResult<Content> =
  | { ok: true; content: Content }
  | { ok: false; status: number; code: string };

type ShareUpdate = Pick<ShareContent, "title" | "markdown" | "images">;
type ShareSummaryRow = Pick<ShareRow, "id" | "note_id" | "live" | "updated_at">;

/**
 * Owner routes for public note links. A share is a plaintext snapshot the
 * owner uploads on purpose: it never reads the end-to-end encrypted sync log,
 * and one note has at most one share, so publishing again replaces the
 * snapshot behind the same link.
 */
export async function handleNoteShareRequest(
  request: Request,
  dependencies: ShareDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const shareId = url.pathname === "/v1/shares" ? null : url.pathname.slice("/v1/shares/".length);
  if (shareId !== null && !isShareId(shareId)) return errorResponse(404, "share_not_found");

  const authentication = await authenticateSyncRequest(
    request,
    dependencies.accessConfiguration,
    dependencies.nowEpochSeconds(),
  );
  if (!authentication.ok) return accessError(authentication.code);
  const owner = authentication.identity.subject;

  if (shareId === null) {
    if (request.method === "GET") return listShares(owner, dependencies);
    if (request.method === "POST") return publishShare(request, owner, dependencies);
    return errorResponse(405, "method_not_allowed");
  }
  if (request.method === "PUT") return updateShare(request, shareId, owner, dependencies);
  if (request.method === "DELETE") return revokeShare(shareId, owner, dependencies);
  return errorResponse(405, "method_not_allowed");
}

/**
 * Unauthenticated read of one share and of the images it publishes. It
 * returns only what the owner published: no owner, account, or workspace
 * identifier leaves the Worker.
 */
export async function handlePublicShareRequest(
  request: Request,
  database: D1Database,
  images: R2Bucket,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(405, "method_not_allowed");
  }
  const [shareId = "", segment, imageId, ...rest] = new URL(request.url).pathname
    .slice("/shares/".length)
    .split("/");
  if (!isShareId(shareId)) return errorResponse(404, "share_not_found");
  if (segment !== undefined) {
    if (segment !== "images" || imageId === undefined || rest.length > 0) {
      return errorResponse(404, "not_found");
    }
    return publicShareImage(request, shareId, imageId, database, images);
  }
  const row = await database
    .prepare(`SELECT title, markdown, updated_at FROM note_share WHERE id = ?1`)
    .bind(shareId)
    .first<Pick<ShareRow, "title" | "markdown" | "updated_at">>();
  if (!row) return errorResponse(404, "share_not_found");
  return Response.json(
    {
      title: row.title,
      markdown: row.markdown,
      updatedAt: row.updated_at,
      images: await listSharedImageIds(images, shareId),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": `public, max-age=${PUBLIC_CACHE_SECONDS}`,
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

async function publicShareImage(
  request: Request,
  shareId: string,
  imageId: string,
  database: D1Database,
  images: R2Bucket,
): Promise<Response> {
  if (!isSharedImageId(imageId)) return errorResponse(404, "image_not_found");
  const share = await database
    .prepare(`SELECT 1 AS present FROM note_share WHERE id = ?1`)
    .bind(shareId)
    .first<{ present: number }>();
  if (!share) return errorResponse(404, "share_not_found");
  return (
    (await readSharedImage(images, shareId, imageId, request.method)) ??
    errorResponse(404, "image_not_found")
  );
}

async function listShares(owner: string, dependencies: ShareDependencies): Promise<Response> {
  const rows = await dependencies.database
    .prepare(
      `SELECT id, note_id, live, updated_at FROM note_share
       WHERE owner_user_id = ?1 ORDER BY updated_at DESC`,
    )
    .bind(owner)
    .all<ShareSummaryRow>();
  return Response.json(
    { shares: rows.results.map((row) => shareSummary(row, dependencies.publicOrigin)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function publishShare(
  request: Request,
  owner: string,
  dependencies: ShareDependencies,
): Promise<Response> {
  const body = await readShareBody(request, "publish");
  if (!body.ok) return errorResponse(body.status, body.code);
  const { content } = body;
  const database = dependencies.database;
  const existing = await database
    .prepare(`SELECT id FROM note_share WHERE owner_user_id = ?1 AND note_id = ?2`)
    .bind(owner, content.noteId)
    .first<{ id: string }>();
  if (!existing) {
    const count = await database
      .prepare(`SELECT COUNT(*) AS total FROM note_share WHERE owner_user_id = ?1`)
      .bind(owner)
      .first<{ total: number }>();
    if ((count?.total ?? 0) >= MAX_SHARES_PER_ACCOUNT) {
      return errorResponse(409, "share_limit_reached");
    }
  }
  const shareId = existing?.id ?? dependencies.newShareId();
  const stored = await storeSharedImages(dependencies.images, shareId, content.images);
  if (!stored.ok) return errorResponse(stored.status, stored.code);
  const now = dependencies.nowEpochSeconds();
  const row = await database
    .prepare(
      `INSERT INTO note_share
         (id, owner_user_id, note_id, title, markdown, live, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(owner_user_id, note_id) DO UPDATE SET
         title = excluded.title,
         markdown = excluded.markdown,
         live = excluded.live,
         updated_at = excluded.updated_at
       RETURNING id, note_id, live, updated_at`,
    )
    .bind(
      shareId,
      owner,
      content.noteId,
      content.title,
      content.markdown,
      content.live ? 1 : 0,
      now,
    )
    .first<ShareSummaryRow>();
  if (!row) {
    await pruneSharedImages(dependencies.images, shareId, new Set());
    return errorResponse(503, "share_service_unavailable");
  }
  if (row.id !== shareId) {
    await pruneSharedImages(dependencies.images, shareId, new Set());
    const restored = await storeSharedImages(dependencies.images, row.id, content.images);
    if (!restored.ok) return errorResponse(restored.status, restored.code);
  }
  await pruneSharedImages(dependencies.images, row.id, new Set(stored.imageIds));
  return Response.json(
    { ...shareSummary(row, dependencies.publicOrigin), imageIds: stored.imageIds },
    {
      status: existing ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * Replaces the snapshot behind an existing link and never creates one, so a
 * background update that races "Stop sharing" cannot bring the link back.
 */
async function updateShare(
  request: Request,
  shareId: string,
  owner: string,
  dependencies: ShareDependencies,
): Promise<Response> {
  const body = await readShareBody(request, "update");
  if (!body.ok) return errorResponse(body.status, body.code);
  const owned = await dependencies.database
    .prepare(`SELECT id FROM note_share WHERE id = ?1 AND owner_user_id = ?2`)
    .bind(shareId, owner)
    .first<{ id: string }>();
  if (!owned) return errorResponse(404, "share_not_found");
  const stored = await storeSharedImages(dependencies.images, shareId, body.content.images);
  if (!stored.ok) return errorResponse(stored.status, stored.code);
  const row = await dependencies.database
    .prepare(
      `UPDATE note_share SET title = ?1, markdown = ?2, updated_at = ?3
       WHERE id = ?4 AND owner_user_id = ?5
       RETURNING id, note_id, live, updated_at`,
    )
    .bind(body.content.title, body.content.markdown, dependencies.nowEpochSeconds(), shareId, owner)
    .first<ShareSummaryRow>();
  if (!row) {
    await pruneSharedImages(dependencies.images, shareId, new Set());
    return errorResponse(404, "share_not_found");
  }
  await pruneSharedImages(dependencies.images, shareId, new Set(stored.imageIds));
  return Response.json(
    { ...shareSummary(row, dependencies.publicOrigin), imageIds: stored.imageIds },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function revokeShare(
  shareId: string,
  owner: string,
  dependencies: ShareDependencies,
): Promise<Response> {
  const result = await dependencies.database
    .prepare(`DELETE FROM note_share WHERE id = ?1 AND owner_user_id = ?2`)
    .bind(shareId, owner)
    .run();
  if (result.meta.changes === 0) return errorResponse(404, "share_not_found");
  await pruneSharedImages(dependencies.images, shareId, new Set());
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function shareSummary(row: ShareSummaryRow, publicOrigin: string) {
  return {
    id: row.id,
    noteId: row.note_id,
    url: `${publicOrigin}/s/${row.id}/`,
    live: row.live === 1,
    updatedAt: row.updated_at,
  };
}

function readShareBody(request: Request, kind: "publish"): Promise<ShareBodyResult<ShareContent>>;
function readShareBody(request: Request, kind: "update"): Promise<ShareBodyResult<ShareUpdate>>;
async function readShareBody(
  request: Request,
  kind: "publish" | "update",
): Promise<ShareBodyResult<ShareContent | ShareUpdate>> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0]?.trim() !== "application/json") {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  const body = await readBoundedBytes(request, MAX_SHARE_BODY_BYTES);
  if (!body.ok) {
    return { ok: false, status: body.code === "request_too_large" ? 413 : 400, code: body.code };
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body.bytes),
    );
  } catch {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  const expectedKeys = (kind === "publish" ? 4 : 2) + ("images" in value ? 1 : 0);
  if (
    Object.keys(value).length !== expectedKeys ||
    !("title" in value) ||
    !("markdown" in value) ||
    typeof value.title !== "string" ||
    typeof value.markdown !== "string" ||
    value.title.length > MAX_SHARED_TITLE_LENGTH
  ) {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  if (new TextEncoder().encode(value.markdown).byteLength > MAX_SHARED_MARKDOWN_BYTES) {
    return { ok: false, status: 413, code: "note_too_large" };
  }
  const images = parseSharedImages("images" in value ? value.images : undefined);
  if (!images.ok) return images;
  if (kind === "update") {
    return {
      ok: true,
      content: { title: value.title, markdown: value.markdown, images: images.images },
    };
  }
  if (
    !("noteId" in value) ||
    !("live" in value) ||
    typeof value.noteId !== "string" ||
    typeof value.live !== "boolean" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.noteId)
  ) {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  return {
    ok: true,
    content: {
      noteId: value.noteId,
      title: value.title,
      markdown: value.markdown,
      live: value.live,
      images: images.images,
    },
  };
}

/** 16 random bytes as unpadded base64url: 22 characters, 128 bits of entropy. */
export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function isShareId(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(value);
}

function accessError(code: SyncAccessFailureCode): Response {
  if (code.startsWith("credential_")) {
    return errorResponse(401, code, { "WWW-Authenticate": 'Bearer realm="skriuw-sync"' });
  }
  return errorResponse(503, code);
}

function errorResponse(status: number, code: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json({ error: code }, { status, headers: responseHeaders });
}

export const noteShareInternals = { readShareBody, isShareId };
