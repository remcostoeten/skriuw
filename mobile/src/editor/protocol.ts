/**
 * The message protocol between the native host and the editor webview
 * (docs/specs/mobile-app.md, "Editor protocol"). Every message is plain JSON:
 * it must survive `JSON.stringify` unchanged, because a webview bridge carries
 * nothing else. This module has no imports so the editor bundle under `app/`
 * and the Expo host under `mobile/` compile the same file.
 */

export const EDITOR_PROTOCOL_VERSION = 1;

/** Longest `failure.detail` the editor emits; diagnostics stay bounded. */
export const EDITOR_FAILURE_DETAIL_LIMIT = 512;

export type EditorDocument = {
  noteId: string;
  /** ProseMirror document JSON in the product schema. */
  document: unknown;
  markdown: string;
  wordCount: number;
  revision: number;
};

export type EditorNoteReference = { id: string; title: string };

export type EditorTagReference = { id: string; name: string; color: string | null };

export type EditorPersonReference = {
  id: string;
  name: string;
  initials: string | null;
  color: string | null;
};

/** One `{ id, revision }` per document the host made durable. */
export type EditorRevision = { id: string; revision: number };

export type EditorRankChange = { id: string; parentId: string | null; rank: number };

/** Mirrors `OperationAck` in the generated workspace contract. */
export type EditorOperationAck = {
  applied: number;
  revisions: EditorRevision[];
  rankChanges: EditorRankChange[];
};

/** Binary payloads cross the bridge as base64 under this key. */
export type EditorBytes = { $bytes: string };

type Versioned<T> = T & { v: typeof EDITOR_PROTOCOL_VERSION };

export type HostToEditorMessage = Versioned<
  | {
      type: "load";
      noteId: string;
      title: string;
      document: unknown;
      markdown: string;
      wordCount: number;
      revision: number;
      theme: string;
    }
  | { type: "theme"; name: string }
  | { type: "remote-change"; changeSet: { documents: EditorDocument[] } }
  /**
   * Replaces the lookup tables behind mention search, note-link resolution and
   * reference chips. The editor reads them synchronously, so the host pushes
   * them instead of answering a query.
   */
  | {
      type: "references";
      notes: EditorNoteReference[];
      tags: EditorTagReference[];
      people: EditorPersonReference[];
    }
  /** Settles one `change`. A rejection carries the backend error message verbatim. */
  | { type: "ack"; changeId: number; ok: true; ack: EditorOperationAck }
  | { type: "ack"; changeId: number; ok: false; error: string }
  /** Settles one `request`. */
  | { type: "response"; requestId: number; ok: true; value: unknown }
  | { type: "response"; requestId: number; ok: false; error: string }
>;

export type EditorFailureCode =
  | "protocol-version"
  | "invalid-message"
  | "change-unacknowledged"
  | "request-unanswered"
  | "runtime-error";

export type EditorToHostMessage = Versioned<
  | { type: "ready" }
  /**
   * One ordered group of versioned `WorkspaceOperation` envelopes, exactly as
   * the desktop renderer submits them. Sent the moment the editor commits:
   * never debounced here, coalesced or dropped, and each group is acknowledged
   * on its own (ADR-0012). `noteId`, `document` and `revision` describe the
   * `save_document` in the group, with `revision` being the revision the edit
   * was made against; they are null for a group without a save.
   */
  | {
      type: "change";
      changeId: number;
      noteId: string | null;
      document: unknown;
      revision: number | null;
      operations: unknown[];
    }
  | { type: "navigate"; noteId: string }
  | { type: "open-link"; url: string }
  /**
   * A bridge command the editor cannot answer itself (media reads and writes).
   * `Uint8Array` arguments travel as `EditorBytes`.
   */
  | { type: "request"; requestId: number; command: string; args: unknown }
  | { type: "failure"; code: EditorFailureCode; detail: string }
>;

const HOST_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "load",
  "theme",
  "remote-change",
  "references",
  "ack",
  "response",
]);

export type ParsedHostMessage =
  | { ok: true; message: HostToEditorMessage }
  | { ok: false; code: "protocol-version" | "invalid-message"; detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditorDocument(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.noteId === "string" &&
    typeof value.markdown === "string" &&
    typeof value.wordCount === "number" &&
    typeof value.revision === "number" &&
    isRecord(value.document)
  );
}

function hasValidBody(message: Record<string, unknown>): boolean {
  switch (message.type) {
    case "load":
      return (
        isEditorDocument(message) && typeof message.title === "string" && typeof message.theme === "string"
      );
    case "theme":
      return typeof message.name === "string";
    case "remote-change":
      return (
        isRecord(message.changeSet) &&
        Array.isArray(message.changeSet.documents) &&
        message.changeSet.documents.every(isEditorDocument)
      );
    case "references":
      return Array.isArray(message.notes) && Array.isArray(message.tags) && Array.isArray(message.people);
    case "ack":
      return (
        typeof message.changeId === "number" &&
        (message.ok === true ? isRecord(message.ack) : typeof message.error === "string")
      );
    case "response":
      return (
        typeof message.requestId === "number" &&
        (message.ok === true ? "value" in message : typeof message.error === "string")
      );
    default:
      return false;
  }
}

/**
 * Validates an inbound message at the trust boundary. Accepts the parsed
 * object or its JSON text, since webview bridges deliver either.
 */
export function parseHostMessage(raw: unknown): ParsedHostMessage {
  let candidate = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch (error) {
      return { ok: false, code: "invalid-message", detail: `unparseable JSON: ${String(error)}` };
    }
  }
  if (!isRecord(candidate) || typeof candidate.type !== "string") {
    return { ok: false, code: "invalid-message", detail: "message has no type" };
  }
  if (candidate.v !== EDITOR_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "protocol-version",
      detail: `editor speaks v${EDITOR_PROTOCOL_VERSION}, host sent v${String(candidate.v)}`,
    };
  }
  if (!HOST_MESSAGE_TYPES.has(candidate.type) || !hasValidBody(candidate)) {
    return { ok: false, code: "invalid-message", detail: `malformed ${candidate.type} message` };
  }
  return { ok: true, message: candidate as HostToEditorMessage };
}

export function boundedFailureDetail(detail: string): string {
  return detail.length > EDITOR_FAILURE_DETAIL_LIMIT
    ? `${detail.slice(0, EDITOR_FAILURE_DETAIL_LIMIT - 1)}…`
    : detail;
}
