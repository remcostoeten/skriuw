import { authConfiguration } from "@/features/auth/config";
import { currentSessionToken } from "@/features/auth/session-token";

export type NoteShare = {
  id: string;
  noteId: string;
  url: string;
  live: boolean;
  updatedAt: number;
};

export type PublishNoteShare = {
  noteId: string;
  title: string;
  markdown: string;
  live: boolean;
};

export class ShareRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ShareRequestError";
  }
}

const SHARE_ERROR_MESSAGES: Record<string, string> = {
  credential_missing: "Sign in to share notes.",
  credential_expired: "Your session expired. Sign in again to share notes.",
  credential_revoked: "Your session ended. Sign in again to share notes.",
  credential_invalid: "Your session is no longer valid. Sign in again to share notes.",
  note_too_large: "This note is too large to share. Shared notes are limited to 512 KB of text.",
  share_limit_reached: "You have reached the limit of 500 shared notes. Stop sharing one first.",
  share_not_found: "This link no longer exists.",
};

async function shareRequest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!authConfiguration.available) {
    throw new ShareRequestError("cloud_unavailable", authConfiguration.reason);
  }
  const token = await currentSessionToken();
  if (!token) {
    throw new ShareRequestError("credential_missing", "Sign in to share notes.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${authConfiguration.baseUrl}${path}`, { ...init, headers });
  } catch {
    throw new ShareRequestError("network", "Skriuw's server could not be reached. Try again.");
  }
  if (response.ok) return response;
  const code = await errorCode(response);
  throw new ShareRequestError(
    code,
    SHARE_ERROR_MESSAGES[code] ?? `Sharing failed on the server (${response.status}). Try again.`,
  );
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      return typeof body.error === "string" ? body.error : "unknown";
    }
  } catch {
    return response.status === 404 ? "share_route_missing" : "unknown";
  }
  return "unknown";
}

function parseShare(value: unknown): NoteShare {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "noteId" in value &&
    "url" in value &&
    "live" in value &&
    "updatedAt" in value &&
    typeof value.id === "string" &&
    typeof value.noteId === "string" &&
    typeof value.url === "string" &&
    /^https?:\/\//.test(value.url) &&
    typeof value.live === "boolean" &&
    typeof value.updatedAt === "number"
  ) {
    return {
      id: value.id,
      noteId: value.noteId,
      url: value.url,
      live: value.live,
      updatedAt: value.updatedAt,
    };
  }
  throw new ShareRequestError("invalid_response", "The server sent an unexpected share response.");
}

export async function listNoteShares(): Promise<NoteShare[]> {
  const body: unknown = await (await shareRequest("/v1/shares")).json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("shares" in body) ||
    !Array.isArray(body.shares)
  ) {
    throw new ShareRequestError("invalid_response", "The server sent an unexpected share list.");
  }
  return body.shares.map(parseShare);
}

export async function publishNoteShare(content: PublishNoteShare): Promise<NoteShare> {
  const response = await shareRequest("/v1/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  return parseShare(await response.json());
}

/** Replaces the text behind an existing link; a revoked link stays revoked. */
export async function updateNoteShare(
  shareId: string,
  content: Pick<PublishNoteShare, "title" | "markdown">,
): Promise<NoteShare> {
  const response = await shareRequest(`/v1/shares/${encodeURIComponent(shareId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  return parseShare(await response.json());
}

export async function revokeNoteShare(shareId: string): Promise<void> {
  try {
    await shareRequest(`/v1/shares/${encodeURIComponent(shareId)}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ShareRequestError && error.code === "share_not_found") return;
    throw error;
  }
}
