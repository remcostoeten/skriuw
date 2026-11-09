import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  DocumentRecord,
  RendererState,
  RendererStore,
} from "@skriuw/renderer-core/store/types";
import { productSchema } from "../schema";

const FALLBACK_BATCH_BUDGET_MS = 4;
const BUSY_BATCH_INTERVAL_MS = 50;

type PreparedEntry = {
  json: unknown;
  document: ProseMirrorNode;
};

type IdleBudget = { timeRemaining(): number };

type IdleHandle = { cancel(): void };

function emptyDocument(): ProseMirrorNode {
  return productSchema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] });
}

function parseDocument(noteId: string, json: unknown): ProseMirrorNode {
  try {
    return productSchema.nodeFromJSON(json);
  } catch (error) {
    console.error(`prepared editor document parse failed for ${noteId}`, error);
    return emptyDocument();
  }
}

function slice(): IdleBudget {
  const end = performance.now() + FALLBACK_BATCH_BUDGET_MS;
  return { timeRemaining: () => end - performance.now() };
}

function requestIdle(callback: (budget: IdleBudget) => void): IdleHandle {
  if ("requestIdleCallback" in globalThis) {
    const id = globalThis.requestIdleCallback(
      (deadline) => callback(deadline.didTimeout ? slice() : deadline),
      { timeout: BUSY_BATCH_INTERVAL_MS },
    );
    return { cancel: () => globalThis.cancelIdleCallback(id) };
  }
  const id = globalThis.setTimeout(() => callback(slice()), 0);
  return { cancel: () => globalThis.clearTimeout(id) };
}

function visibleNoteIds(state: RendererState): Set<string> {
  const noteIds = new Set<string>();
  if (state.activeNoteId !== null) noteIds.add(state.activeNoteId);
  for (const pane of state.panes) {
    if (pane.activeNoteId !== null) noteIds.add(pane.activeNoteId);
    for (const noteId of pane.openNoteIds) noteIds.add(noteId);
  }
  return noteIds;
}

/**
 * Lightweight immutable ProseMirror documents prepared from workspace
 * hydration. The active note and open tabs are prepared at construction; the
 * rest are prepared in idle batches, and a note that has not been reached yet
 * is prepared on its first request. Full EditorState instances remain bounded
 * by the editor LRU.
 */
export class PreparedEditorDocuments {
  private readonly entries = new Map<string, PreparedEntry>();
  private documents: ReadonlyMap<string, DocumentRecord>;
  private pending: string[] = [];
  private idle: IdleHandle | null = null;
  private readonly unsubscribe: () => void;

  constructor(store: RendererStore) {
    const state = store.getState();
    this.documents = state.documents;
    for (const noteId of visibleNoteIds(state)) {
      const record = this.documents.get(noteId);
      if (record) this.documentFor(record);
    }
    this.enqueue(this.documents.keys());
    this.unsubscribe = store.subscribe(
      (current) => current.documents,
      () => this.reconcile(store.getState().documents),
    );
  }

  documentFor(record: DocumentRecord): ProseMirrorNode {
    const prepared = this.entries.get(record.noteId);
    if (prepared && prepared.json === record.documentJson) {
      return prepared.document;
    }
    const document = parseDocument(record.noteId, record.documentJson);
    this.entries.set(record.noteId, { json: record.documentJson, document });
    return document;
  }

  /** Stages an editor-owned node before its optimistic JSON operation publishes. */
  stage(noteId: string, json: unknown, document: ProseMirrorNode): void {
    this.entries.set(noteId, { json, document });
  }

  metrics(): { documentCount: number; topLevelBlockCount: number } {
    let topLevelBlockCount = 0;
    for (const entry of this.entries.values()) {
      topLevelBlockCount += entry.document.childCount;
    }
    return { documentCount: this.entries.size, topLevelBlockCount };
  }

  destroy(): void {
    this.unsubscribe();
    this.idle?.cancel();
    this.idle = null;
    this.pending = [];
    this.entries.clear();
  }

  private enqueue(noteIds: Iterable<string>): void {
    for (const noteId of noteIds) {
      if (!this.entries.has(noteId)) this.pending.push(noteId);
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.idle !== null || this.pending.length === 0) return;
    this.idle = requestIdle((budget) => {
      this.idle = null;
      this.prepareWithin(budget);
    });
  }

  private prepareWithin(budget: IdleBudget): void {
    do {
      const noteId = this.pending.pop();
      if (noteId === undefined) break;
      const record = this.documents.get(noteId);
      if (record) this.documentFor(record);
    } while (budget.timeRemaining() > 0);
    this.schedule();
  }

  private reconcile(next: ReadonlyMap<string, DocumentRecord>): void {
    const stale: string[] = [];
    for (const [noteId, record] of next) {
      const prepared = this.entries.get(noteId);
      if (prepared ? prepared.json !== record.documentJson : !this.documents.has(noteId)) {
        this.entries.delete(noteId);
        stale.push(noteId);
      }
    }
    for (const noteId of this.documents.keys()) {
      if (!next.has(noteId)) this.entries.delete(noteId);
    }
    this.documents = next;
    this.enqueue(stale);
  }
}

const preparedByStore = new WeakMap<RendererStore, PreparedEditorDocuments>();

export function preparedEditorDocuments(store: RendererStore): PreparedEditorDocuments {
  let prepared = preparedByStore.get(store);
  if (!prepared) {
    prepared = new PreparedEditorDocuments(store);
    preparedByStore.set(store, prepared);
  }
  return prepared;
}
