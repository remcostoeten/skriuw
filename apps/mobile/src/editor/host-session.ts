import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import {
  WORKSPACE_PROTOCOL_VERSION,
  type OperationAck,
  type WorkspaceOperation,
  type WorkspaceOperationEnvelope,
} from "@skriuw/renderer-core/contracts/workspace";
import type { DocumentRecord, RendererState } from "@skriuw/renderer-core/store/types";
import { commitOperations, type WorkspaceSession } from "../bridge/commit";
import { decodeBase64, editorBytes, isEditorBytes } from "./bytes";
import { describeEditorFailure, type EditorFailureView } from "./failure-view";
import { parseEditorMessage } from "./host-messages";
import {
  EDITOR_PROTOCOL_VERSION,
  type EditorDocument,
  type EditorTheme,
  type EditorToHostMessage,
  type HostToEditorMessage,
} from "./protocol";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type OutboundMessage = DistributiveOmit<HostToEditorMessage, "v">;

/** The state of one note as the webview last received it, so echoes stay quiet. */
type MirroredDocument = { revision: number; markdown: string };

export type EditorHostOptions = {
  session: WorkspaceSession;
  /** Hands one message to the warm webview. Dropped messages are the caller's business. */
  send: (message: HostToEditorMessage) => void;
  /** Opens an external URL natively; the webview is never allowed to navigate. */
  openLink: (url: string) => void;
  /** The resolved shell palette, read at the moment a message is composed. */
  theme: () => EditorTheme;
  /** Renders the recoverable surface; `null` clears it. */
  showFailure: (view: EditorFailureView | null) => void;
};

export type EditorHostSession = {
  /** One raw message from the webview, parsed at the trust boundary. */
  receive: (raw: unknown) => void;
  /** Publishes a theme change without reloading the page. */
  setTheme: (theme: EditorTheme) => void;
  /** The webview's process died: the same recoverable surface as a `failure`. */
  reportWebviewGone: (detail: string) => void;
  /** Recovery action. The caller remounts the webview; the next `ready` refills it. */
  restart: () => void;
  dispose: () => void;
};

const EMPTY_ACK: OperationAck = { applied: 0, revisions: [], rankChanges: [] };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function editorDocument(record: DocumentRecord): EditorDocument {
  return {
    noteId: record.noteId,
    document: record.documentJson,
    markdown: record.markdown,
    wordCount: record.wordCount,
    revision: record.revision,
  };
}

function savedOperation(
  operations: readonly WorkspaceOperation[],
): Extract<WorkspaceOperation, { type: "save_document" }> | null {
  for (const operation of operations) {
    if (operation.type === "save_document") return operation;
  }
  return null;
}

/**
 * Unwraps the envelopes the editor submitted. The editor bundle is built from
 * this repository, so a mismatched `protocolVersion` means the packaged page
 * is stale: it is refused with the version in the message rather than applied.
 */
function unwrapOperations(envelopes: readonly unknown[]): WorkspaceOperation[] {
  return envelopes.map((candidate, index) => {
    const envelope = candidate as Partial<WorkspaceOperationEnvelope>;
    if (envelope?.protocolVersion !== WORKSPACE_PROTOCOL_VERSION) {
      throw new Error(
        `operation ${index} speaks workspace protocol v${String(envelope?.protocolVersion)}, the app speaks v${WORKSPACE_PROTOCOL_VERSION}. Reinstall the app to update the editor.`,
      );
    }
    const operation = envelope.operation;
    if (typeof operation !== "object" || operation === null || typeof operation.type !== "string") {
      throw new Error(`operation ${index} has no type.`);
    }
    return operation;
  });
}

/**
 * Wraps the workspace session so the acknowledgement the backend returned is
 * observable. `commitOperations` owns the store's save path and returns
 * nothing; the editor needs the same ack the store got, and it must be
 * recorded before `applyAck` runs so the resulting revision bump is not
 * mistaken for a remote change.
 */
function observingAck(
  session: WorkspaceSession,
  observe: (ack: OperationAck) => void,
): WorkspaceSession {
  return {
    ...session,
    bridge: {
      ...session.bridge,
      applyWorkspaceOperations: async (operations) => {
        const ack = await session.bridge.applyWorkspaceOperations(operations);
        observe(ack);
        return ack;
      },
    },
  };
}

async function serveCommand(bridge: BridgePort, command: string, args: unknown): Promise<unknown> {
  if (command === "store_note_image") {
    if (!isEditorBytes(args)) throw new Error("Storing media needs the image bytes.");
    return await bridge.storeNoteImage(decodeBase64(args.$bytes));
  }
  if (command === "read_note_image_blob") {
    const { contentHash, mimeType } = (args ?? {}) as { contentHash?: string; mimeType?: string };
    if (typeof contentHash !== "string" || typeof mimeType !== "string") {
      throw new Error("Reading stored media needs a content hash and a MIME type.");
    }
    return editorBytes(await bridge.readNoteImageBlob(contentHash, mimeType));
  }
  throw new Error(`${command} is not served by the mobile editor host.`);
}

/**
 * Drives the one warm editor webview (`docs/specs/mobile-app.md`, R-P2). It
 * holds no React state: switching notes, publishing references and settling
 * changes are plain store subscriptions and protocol messages, so typing
 * renders nothing outside the webview (R-P3).
 */
export function createEditorHostSession({
  session,
  send,
  openLink,
  theme,
  showFailure,
}: EditorHostOptions): EditorHostSession {
  const { store, bridge } = session;
  const mirror = new Map<string, MirroredDocument>();
  /** Changes commit in the order the editor emitted them (ADR-0012). */
  let queue: Promise<void> = Promise.resolve();
  let ready = false;
  let loadedNoteId: string | null = null;
  let hydrating: string | null = null;
  let disposed = false;

  function emit(message: OutboundMessage): void {
    send({ ...message, v: EDITOR_PROTOCOL_VERSION } as HostToEditorMessage);
  }

  function publishReferences(): void {
    if (!ready) return;
    const state = store.getState();
    const notes = [];
    for (const node of state.nodes.values()) {
      if (node.kind === "note") notes.push({ id: node.id, title: node.title });
    }
    emit({
      type: "references",
      notes,
      tags: [...state.tags.values()].map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color ?? null,
      })),
      people: [...state.people.values()].map((person) => ({
        id: person.id,
        name: person.name,
        initials: person.initials ?? null,
        color: person.color ?? null,
      })),
    });
  }

  /**
   * Fetches a document the snapshot did not carry. Navigation already happened
   * in the store, so nothing on the interaction path waits for this read
   * (R-P1); only the webview's paint does.
   */
  function hydrate(noteId: string): void {
    if (hydrating === noteId) return;
    hydrating = noteId;
    bridge
      .readWorkspaceDelta([noteId])
      .then((delta) => {
        if (disposed) return;
        store.applyRemoteDocuments(delta);
        loadActiveNote();
      })
      .catch((error: unknown) => {
        session.reportFailure(error);
        showFailure(describeEditorFailure("runtime-error", errorMessage(error)));
      })
      .finally(() => {
        if (hydrating === noteId) hydrating = null;
      });
  }

  function loadActiveNote(): void {
    if (!ready) return;
    const state = store.getState();
    const noteId = state.activeNoteId;
    if (noteId === null || noteId === loadedNoteId) return;
    const record = state.documents.get(noteId);
    if (!record) {
      hydrate(noteId);
      return;
    }
    loadedNoteId = noteId;
    mirror.set(noteId, { revision: record.revision, markdown: record.markdown });
    emit({
      type: "load",
      noteId,
      title: state.nodes.get(noteId)?.title ?? "Untitled",
      document: record.documentJson,
      markdown: record.markdown,
      wordCount: record.wordCount,
      revision: record.revision,
      theme: theme(),
    });
  }

  /**
   * Forwards a document the webview does not hold yet. The mirror is what the
   * editor was last given or last sent, so an optimistic save and its own
   * acknowledgement never come back as a remote change.
   */
  function publishRemoteChange(): void {
    if (!ready || loadedNoteId === null) return;
    const record = store.getState().documents.get(loadedNoteId);
    if (!record) return;
    const known = mirror.get(loadedNoteId);
    if (known && known.revision === record.revision && known.markdown === record.markdown) return;
    mirror.set(loadedNoteId, { revision: record.revision, markdown: record.markdown });
    emit({ type: "remote-change", changeSet: { documents: [editorDocument(record)] } });
  }

  function rememberAck(ack: OperationAck): void {
    for (const revision of ack.revisions) {
      const known = mirror.get(revision.id);
      if (known) mirror.set(revision.id, { ...known, revision: revision.revision });
    }
  }

  async function commitChange(
    message: Extract<EditorToHostMessage, { type: "change" }>,
  ): Promise<void> {
    let operations: WorkspaceOperation[];
    try {
      operations = unwrapOperations(message.operations);
    } catch (error) {
      emit({ type: "ack", changeId: message.changeId, ok: false, error: errorMessage(error) });
      return;
    }
    const saved = savedOperation(operations);
    if (saved) {
      const known = mirror.get(saved.noteId);
      mirror.set(saved.noteId, {
        revision: known?.revision ?? saved.expectedRevision,
        markdown: saved.markdown,
      });
    }
    let ack: OperationAck | null = null;
    try {
      await commitOperations(
        observingAck(session, (settled) => {
          ack = settled;
          rememberAck(settled);
        }),
        operations,
      );
    } catch (error) {
      emit({ type: "ack", changeId: message.changeId, ok: false, error: errorMessage(error) });
      return;
    }
    emit({ type: "ack", changeId: message.changeId, ok: true, ack: ack ?? EMPTY_ACK });
  }

  async function answerRequest(
    message: Extract<EditorToHostMessage, { type: "request" }>,
  ): Promise<void> {
    try {
      const value = await serveCommand(bridge, message.command, message.args);
      emit({ type: "response", requestId: message.requestId, ok: true, value });
    } catch (error) {
      session.reportFailure(error);
      emit({
        type: "response",
        requestId: message.requestId,
        ok: false,
        error: errorMessage(error),
      });
    }
  }

  function enqueue(run: () => Promise<void>): void {
    queue = queue.then(run, run);
  }

  function open(): void {
    ready = true;
    showFailure(null);
    publishReferences();
    loadActiveNote();
  }

  function reset(view: EditorFailureView | null): void {
    ready = false;
    loadedNoteId = null;
    hydrating = null;
    mirror.clear();
    showFailure(view);
  }

  function receive(raw: unknown): void {
    if (disposed) return;
    const parsed = parseEditorMessage(raw);
    if (!parsed.ok) {
      session.reportFailure(new Error(`the editor sent an unusable message: ${parsed.detail}`));
      showFailure(describeEditorFailure("invalid-message", parsed.detail));
      return;
    }
    const message = parsed.message;
    switch (message.type) {
      case "ready":
        open();
        return;
      case "change":
        enqueue(() => commitChange(message));
        return;
      case "navigate":
        store.setActiveNote(message.noteId);
        return;
      case "open-link":
        openLink(message.url);
        return;
      case "request":
        enqueue(() => answerRequest(message));
        return;
      case "failure":
        session.reportFailure(new Error(`editor ${message.code}: ${message.detail}`));
        showFailure(describeEditorFailure(message.code, message.detail));
    }
  }

  function referenceTables(state: RendererState) {
    return { nodes: state.nodes, tags: state.tags, people: state.people };
  }

  const stopWatchingReferences = store.subscribe(
    referenceTables,
    publishReferences,
    (left, right) =>
      left.nodes === right.nodes && left.tags === right.tags && left.people === right.people,
  );
  const stopWatchingActiveNote = store.subscribe((state) => state.activeNoteId, loadActiveNote);
  const stopWatchingDocuments = store.subscribe((state) => state.documents, publishRemoteChange);

  return {
    receive,
    setTheme: (theme) => {
      if (ready) emit({ type: "theme", theme });
    },
    reportWebviewGone: (detail) => reset(describeEditorFailure("webview-gone", detail)),
    restart: () => reset(null),
    dispose: () => {
      disposed = true;
      stopWatchingReferences();
      stopWatchingActiveNote();
      stopWatchingDocuments();
    },
  };
}
