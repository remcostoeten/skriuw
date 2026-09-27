import type {
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

function node(id: string, lockedAt: number | null): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank: 1,
    title: `${id} title`,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    lockedAt,
  };
}

function document(noteId: string, sealed: boolean): WorkspaceDocument {
  return {
    noteId,
    documentJson: { type: "doc", content: [] },
    markdown: sealed ? "" : `${noteId} body`,
    revision: 1,
    wordCount: sealed ? 0 : 2,
    sealed: sealed
      ? { scheme: "argon2id-xchacha20poly1305-v2", keyId: "k", nonce: "n", ciphertext: "c" }
      : null,
  };
}

/** Notes `open`, `locked` (unlocked this session), and `sealed`. */
export function sharingStore(): RendererStore {
  const snapshot: WorkspaceSnapshot = {
    protocolVersion: 1,
    activeNoteId: "open",
    nodes: [node("open", null), node("locked", 10), node("sealed", 10)],
    documents: [document("open", false), document("locked", false), document("sealed", true)],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "midnight",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "inter",
      editorLineHeight: "comfortable",
      showLineNumbers: true,
      editorPlaceholder: "Start writing...",
    },
  };
  return createRendererStore(createInitialState(snapshot, []));
}

export function editNote(store: RendererStore, noteId: string, markdown: string): void {
  const revision = store.getState().documents.get(noteId)?.revision ?? 0;
  store.applyOperations([
    {
      type: "save_document",
      noteId,
      documentJson: { type: "doc", content: [] },
      markdown,
      wordCount: markdown.split(/\s+/).length,
      expectedRevision: revision,
      at: Date.now(),
    },
  ]);
}
