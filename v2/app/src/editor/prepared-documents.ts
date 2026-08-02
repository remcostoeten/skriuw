import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { DocumentRecord, RendererStore } from "../store/types";
import { productSchema } from "./schema";

type PreparedEntry = {
  json: unknown;
  document: ProseMirrorNode;
};

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

/**
 * Lightweight immutable ProseMirror documents prepared during workspace
 * hydration. Full EditorState instances remain bounded by the editor LRU.
 */
export class PreparedEditorDocuments {
  private readonly entries = new Map<string, PreparedEntry>();
  private documents: ReadonlyMap<string, DocumentRecord>;
  private readonly unsubscribe: () => void;

  constructor(store: RendererStore) {
    this.documents = store.getState().documents;
    for (const record of this.documents.values()) {
      this.entries.set(record.noteId, {
        json: record.documentJson,
        document: parseDocument(record.noteId, record.documentJson),
      });
    }
    this.unsubscribe = store.subscribe(
      (state) => state.documents,
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
    this.entries.clear();
  }

  private reconcile(next: ReadonlyMap<string, DocumentRecord>): void {
    for (const [noteId, record] of next) {
      const prepared = this.entries.get(noteId);
      if (!prepared || prepared.json !== record.documentJson) {
        this.entries.set(noteId, {
          json: record.documentJson,
          document: parseDocument(record.noteId, record.documentJson),
        });
      }
    }
    for (const noteId of this.documents.keys()) {
      if (!next.has(noteId)) this.entries.delete(noteId);
    }
    this.documents = next;
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
