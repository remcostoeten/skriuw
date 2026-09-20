import { EDITOR_PROTOCOL_VERSION, type EditorToHostMessage } from "./protocol";

/**
 * The host's half of the trust boundary. `protocol.ts` validates what the host
 * sends the webview; this validates what comes back, because a webview is not
 * trusted input: a stale bundle, a broken page or an injected script can post
 * anything at all, and nothing malformed may reach the store or the bridge.
 */

export type ParsedEditorMessage =
  | { ok: true; message: EditorToHostMessage }
  | { ok: false; detail: string };

const FAILURE_CODES: ReadonlySet<string> = new Set([
  "protocol-version",
  "invalid-message",
  "change-unacknowledged",
  "request-unanswered",
  "runtime-error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidBody(message: Record<string, unknown>): boolean {
  switch (message.type) {
    case "ready":
      return true;
    case "change":
      return (
        typeof message.changeId === "number" &&
        Array.isArray(message.operations) &&
        (message.noteId === null || typeof message.noteId === "string") &&
        (message.revision === null || typeof message.revision === "number")
      );
    case "navigate":
      return typeof message.noteId === "string";
    case "open-link":
      return typeof message.url === "string";
    case "request":
      return typeof message.requestId === "number" && typeof message.command === "string";
    case "failure":
      return typeof message.code === "string" && FAILURE_CODES.has(message.code) && typeof message.detail === "string";
    default:
      return false;
  }
}

/** Accepts the parsed object or its JSON text, since webview bridges deliver either. */
export function parseEditorMessage(raw: unknown): ParsedEditorMessage {
  let candidate = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch (error) {
      return { ok: false, detail: `unparseable JSON: ${String(error)}` };
    }
  }
  if (!isRecord(candidate) || typeof candidate.type !== "string") {
    return { ok: false, detail: "message has no type" };
  }
  if (candidate.v !== EDITOR_PROTOCOL_VERSION) {
    return {
      ok: false,
      detail: `host speaks v${EDITOR_PROTOCOL_VERSION}, editor sent v${String(candidate.v)}`,
    };
  }
  if (!hasValidBody(candidate)) {
    return { ok: false, detail: `malformed ${candidate.type} message` };
  }
  return { ok: true, message: candidate as EditorToHostMessage };
}
