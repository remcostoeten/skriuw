import {
  EDITOR_PROTOCOL_VERSION,
  boundedFailureDetail,
  parseHostMessage,
  type EditorBytes,
  type EditorDocument,
  type EditorFailureCode,
  type EditorTheme,
  type EditorToHostMessage,
  type HostToEditorMessage,
} from "../../../../mobile/src/editor/protocol.ts";
import {
  WORKSPACE_PROTOCOL_VERSION,
  type OperationAck,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceOperationEnvelope,
  type WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import type { PersonRecord, TagRecord } from "@skriuw/renderer-core/references/types";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  InMemoryCustomThemeRegistry,
  type ThemeDefinition,
  type ThemeTokens,
} from "@skriuw/theme";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type OutboundMessage = DistributiveOmit<EditorToHostMessage, "v">;

type Settlement = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingChange = Settlement & { saved: WorkspaceDocument | null };

export type EditorSessionOptions = {
  store: RendererStore;
  send: (message: EditorToHostMessage) => void;
  /** How long a `change` or `request` may stay unanswered before it is rejected. */
  replyTimeoutMs?: number;
  themeRegistry?: InMemoryCustomThemeRegistry;
};

export type EditorSession = {
  receive: (raw: unknown) => void;
  /** Answers the bridge's `invoke` seam over the protocol. */
  invoke: <T>(command: string, args?: unknown) => Promise<T>;
  openLink: (url: string) => void;
  fail: (code: EditorFailureCode, detail: string) => void;
  ready: () => void;
  destroy: () => void;
};

const DEFAULT_REPLY_TIMEOUT_MS = 15_000;

function encodeBytes(bytes: Uint8Array): EditorBytes {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { $bytes: btoa(binary) };
}

function decodeBytes(value: unknown): unknown {
  if (typeof value !== "object" || value === null || typeof (value as EditorBytes).$bytes !== "string") {
    return value;
  }
  const binary = atob((value as EditorBytes).$bytes);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function noteNode(id: string, title: string, rank: number, at: number): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title,
    icon: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    pinnedAt: null,
  };
}

function workspaceDocument(document: EditorDocument): WorkspaceDocument {
  return {
    noteId: document.noteId,
    documentJson: document.document,
    markdown: document.markdown,
    wordCount: document.wordCount,
    revision: document.revision,
  };
}

function savedDocument(operations: readonly WorkspaceOperationEnvelope[]): WorkspaceDocument | null {
  for (const { operation } of operations) {
    if (operation.type === "save_document") {
      return {
        noteId: operation.noteId,
        documentJson: operation.documentJson,
        markdown: operation.markdown,
        wordCount: operation.wordCount,
        revision: operation.expectedRevision,
      };
    }
  }
  return null;
}

/**
 * Drives one `RendererStore` from host messages and turns everything the
 * editor submits through the bridge seam back into protocol messages. It holds
 * no DOM and no editor state: the unforked `NoteEditor` reacts to the store
 * exactly as it does on the desktop.
 */
export function createEditorSession({
  store,
  send,
  replyTimeoutMs = DEFAULT_REPLY_TIMEOUT_MS,
  themeRegistry = new InMemoryCustomThemeRegistry(),
}: EditorSessionOptions): EditorSession {
  const durableDocuments = new Map<string, WorkspaceDocument>();
  const pendingChanges = new Map<number, PendingChange>();
  const pendingRequests = new Map<number, Settlement>();
  let loadedNoteId: string | null = null;
  let nextChangeId = 1;
  let nextRequestId = 1;
  let nextRank = 1;

  function emit(message: OutboundMessage): void {
    send({ ...message, v: EDITOR_PROTOCOL_VERSION } as EditorToHostMessage);
  }

  function fail(code: EditorFailureCode, detail: string): void {
    emit({ type: "failure", code, detail: boundedFailureDetail(detail) });
  }

  function rememberDurable(document: WorkspaceDocument): void {
    const known = durableDocuments.get(document.noteId);
    if (!known || known.revision <= document.revision) durableDocuments.set(document.noteId, document);
  }

  function ensureNotes(notes: readonly { id: string; title: string }[]): void {
    const known = store.getState().sourceNodes;
    const at = Date.now();
    const nodes: WorkspaceNode[] = [];
    for (const { id, title } of notes) {
      const existing = known.get(id);
      if (!existing) {
        nodes.push(noteNode(id, title, nextRank, at));
        nextRank += 1;
      } else if (existing.title !== title && id !== loadedNoteId) {
        nodes.push({ ...existing, title, updatedAt: at });
      }
    }
    if (nodes.length > 0) store.applyRemoteDocuments({ documents: [], nodes });
  }

  function applyTheme(theme: EditorTheme): void {
    themeRegistry.set({ ...theme, tokens: theme.tokens as ThemeTokens } as ThemeDefinition);
    store.update((state) =>
      state.settings.theme === theme.id
        ? state
        : { ...state, settings: { ...state.settings, theme: theme.id } },
    );
  }

  function adoptDocuments(documents: readonly EditorDocument[]): void {
    const adopted = documents.map(workspaceDocument);
    for (const document of adopted) rememberDurable(document);
    store.applyRemoteDocuments({ documents: adopted, nodes: [] });
  }

  function load(message: Extract<HostToEditorMessage, { type: "load" }>): void {
    ensureNotes([{ id: message.noteId, title: message.title }]);
    adoptDocuments([message]);
    applyTheme(message.theme);
    loadedNoteId = message.noteId;
    store.setActiveNote(message.noteId);
  }

  function replaceReferences(message: Extract<HostToEditorMessage, { type: "references" }>): void {
    ensureNotes(message.notes);
    const at = Date.now();
    const current = store.getState();
    const tags = new Map<string, TagRecord>();
    for (const tag of message.tags) {
      tags.set(tag.id, { createdAt: at, updatedAt: at, createdIn: null, ...current.tags.get(tag.id), ...tag });
    }
    const people = new Map<string, PersonRecord>();
    for (const person of message.people) {
      people.set(person.id, {
        note: null,
        createdAt: at,
        updatedAt: at,
        createdIn: null,
        ...current.people.get(person.id),
        ...person,
      });
    }
    store.update((state) => ({ ...state, tags, people }));
  }

  function settleChange(message: Extract<HostToEditorMessage, { type: "ack" }>): void {
    const pending = pendingChanges.get(message.changeId);
    if (!pending) return;
    pendingChanges.delete(message.changeId);
    clearTimeout(pending.timer);
    if (!message.ok) {
      pending.reject(new Error(message.error));
      return;
    }
    if (pending.saved) {
      const noteId = pending.saved.noteId;
      const revision = message.ack.revisions.find(({ id }) => id === noteId)?.revision;
      if (revision !== undefined) rememberDurable({ ...pending.saved, revision });
    }
    pending.resolve(message.ack);
  }

  function settleRequest(message: Extract<HostToEditorMessage, { type: "response" }>): void {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    pendingRequests.delete(message.requestId);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(decodeBytes(message.value));
    else pending.reject(new Error(message.error));
  }

  function receive(raw: unknown): void {
    const parsed = parseHostMessage(raw);
    if (!parsed.ok) {
      fail(parsed.code, parsed.detail);
      return;
    }
    const message = parsed.message;
    switch (message.type) {
      case "load":
        load(message);
        return;
      case "theme":
        applyTheme(message.theme);
        return;
      case "remote-change":
        adoptDocuments(message.changeSet.documents);
        return;
      case "references":
        replaceReferences(message);
        return;
      case "ack":
        settleChange(message);
        return;
      case "response":
        settleRequest(message);
    }
  }

  function submitChange(operations: WorkspaceOperationEnvelope[]): Promise<OperationAck> {
    const changeId = nextChangeId;
    nextChangeId += 1;
    const saved = savedDocument(operations);
    return new Promise<OperationAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingChanges.delete(changeId);
        fail("change-unacknowledged", `change ${changeId} was not acknowledged`);
        reject(new Error(`the host did not acknowledge change ${changeId}`));
      }, replyTimeoutMs);
      pendingChanges.set(changeId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        saved,
      });
      emit({
        type: "change",
        changeId,
        noteId: saved?.noteId ?? null,
        document: saved?.documentJson ?? null,
        revision: saved?.revision ?? null,
        operations,
      });
    });
  }

  function request(command: string, args: unknown): Promise<unknown> {
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        fail("request-unanswered", `${command} was not answered`);
        reject(new Error(`the host did not answer ${command}`));
      }, replyTimeoutMs);
      pendingRequests.set(requestId, { resolve, reject, timer });
      emit({
        type: "request",
        requestId,
        command,
        args: args instanceof Uint8Array ? encodeBytes(args) : (args ?? null),
      });
    });
  }

  /**
   * The snapshot the renderer re-reads after a rejected commit: every document
   * at the last state the host confirmed, so an optimistic save that failed is
   * rolled back to durable truth and the editor's merge keeps the local edit.
   */
  function durableSnapshot(): WorkspaceSnapshot {
    const state = store.getState();
    return {
      protocolVersion: WORKSPACE_PROTOCOL_VERSION,
      activeNoteId: loadedNoteId,
      nodes: [...state.sourceNodes.values()],
      documents: [...durableDocuments.values()],
      historyHeaders: [],
      settings: state.settings,
      tags: [...state.tags.values()],
      people: [...state.people.values()],
      references: [...state.outgoingReferences.entries()].map(([noteId, targets]) => ({
        noteId,
        targets: [...targets],
      })),
    };
  }

  function invoke<T>(command: string, args?: unknown): Promise<T> {
    if (command === "apply_workspace_operations") {
      const { operations } = args as { operations: WorkspaceOperationEnvelope[] };
      return submitChange(operations) as Promise<T>;
    }
    if (command === "bootstrap_workspace") {
      return Promise.resolve(durableSnapshot() as T);
    }
    return request(command, args) as Promise<T>;
  }

  const stopWatchingNavigation = store.subscribe(
    (state) => state.activeNoteId,
    () => {
      const requested = store.getState().activeNoteId;
      if (requested === loadedNoteId) return;
      if (requested !== null) emit({ type: "navigate", noteId: requested });
      store.setActiveNote(loadedNoteId);
    },
  );

  return {
    receive,
    invoke,
    fail,
    openLink: (url) => emit({ type: "open-link", url }),
    ready: () => emit({ type: "ready" }),
    destroy: () => {
      stopWatchingNavigation();
      for (const pending of [...pendingChanges.values(), ...pendingRequests.values()]) {
        clearTimeout(pending.timer);
        pending.reject(new Error("the editor session was closed"));
      }
      pendingChanges.clear();
      pendingRequests.clear();
    },
  };
}
