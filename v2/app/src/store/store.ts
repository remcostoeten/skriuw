import type { WorkspaceSnapshot } from "../contracts/workspace";
import { ancestorIds, buildNodeIndex, flattenVisible, orderAvailableNodes } from "./tree";
import type {
  DocumentRecord,
  Equality,
  Listener,
  NoteMetadata,
  RendererState,
  RendererStore,
  Selector,
} from "./types";

type Subscriber<T = unknown> = {
  active: boolean;
  selector: Selector<T>;
  equality: Equality<T>;
  selected: T;
  listener: Listener;
};

function strictEqual<T>(left: T, right: T): boolean {
  return Object.is(left, right);
}

export function createInitialState(snapshot: WorkspaceSnapshot): RendererState {
  const ordered = orderAvailableNodes(snapshot.nodes);
  const index = buildNodeIndex(ordered);
  const expandedIds = new Set(
    ordered.filter((node) => node.kind === "folder").map((node) => node.id),
  );
  const documents = new Map<string, DocumentRecord>();
  for (const document of snapshot.documents) {
    if (index.nodes.has(document.noteId)) {
      documents.set(document.noteId, document);
    }
  }
  const metadata = new Map<string, NoteMetadata>();
  for (const node of ordered) {
    if (node.kind !== "note") {
      continue;
    }
    metadata.set(node.id, {
      title: node.title,
      wordCount: documents.get(node.id)?.wordCount ?? 0,
      updatedAt: node.updatedAt,
    });
  }
  const activeNoteId =
    snapshot.activeNoteId && documents.has(snapshot.activeNoteId)
      ? snapshot.activeNoteId
      : ([...documents.keys()][0] ?? null);
  return {
    ...index,
    visibleIds: flattenVisible(index.nodes, index.childrenByParent, expandedIds),
    expandedIds,
    activeNoteId,
    focusedNodeId: activeNoteId,
    documents,
    metadata,
    settings: snapshot.settings,
  };
}

export function createRendererStore(initialState: RendererState): RendererStore {
  let state = initialState;
  let destroyed = false;
  const subscribers = new Set<Subscriber>();
  let publishing = false;
  const queuedUpdaters: ((state: RendererState) => RendererState)[] = [];

  function subscribe<T>(
    selector: Selector<T>,
    listener: Listener,
    equality: Equality<T> = strictEqual,
  ): () => void {
    if (destroyed) {
      throw new Error("renderer store is destroyed");
    }
    const subscriber: Subscriber<T> = {
      active: true,
      selector,
      equality,
      selected: selector(state),
      listener,
    };
    subscribers.add(subscriber as Subscriber);
    return () => {
      if (!subscriber.active) {
        return;
      }
      subscriber.active = false;
      subscribers.delete(subscriber as Subscriber);
    };
  }

  function update(updater: (current: RendererState) => RendererState): boolean {
    if (destroyed) {
      throw new Error("renderer store is destroyed");
    }
    if (publishing) {
      queuedUpdaters.push(updater);
      return true;
    }
    const failures: unknown[] = [];
    let changed = false;
    publishing = true;
    queuedUpdaters.push(updater);
    while (queuedUpdaters.length > 0) {
      const nextUpdater = queuedUpdaters.shift();
      if (!nextUpdater) {
        break;
      }
      const next = nextUpdater(state);
      if (Object.is(next, state)) {
        continue;
      }
      state = next;
      changed = true;
      for (const subscriber of [...subscribers]) {
        if (!subscriber.active) {
          continue;
        }
        let selected: unknown;
        try {
          selected = subscriber.selector(state);
          if (subscriber.equality(subscriber.selected, selected)) {
            continue;
          }
        } catch (error) {
          failures.push(error);
          continue;
        }
        subscriber.selected = selected;
        try {
          subscriber.listener();
        } catch (error) {
          failures.push(error);
        }
      }
    }
    publishing = false;
    if (failures.length > 0) {
      throw new AggregateError(failures, "renderer store subscriber failure");
    }
    return changed;
  }

  function setActiveNote(id: string | null): boolean {
    return update((current) => {
      if (id === current.activeNoteId) {
        return current;
      }
      if (id !== null && !current.documents.has(id)) {
        return current;
      }
      return { ...current, activeNoteId: id, focusedNodeId: id };
    });
  }

  function toggleExpanded(id: string): boolean {
    return update((current) => {
      const node = current.nodes.get(id);
      if (!node || node.kind !== "folder") {
        return current;
      }
      const expandedIds = new Set(current.expandedIds);
      const collapsing = expandedIds.delete(id);
      if (!collapsing) {
        expandedIds.add(id);
      }
      let focusedNodeId = current.focusedNodeId;
      if (collapsing && focusedNodeId && ancestorIds(current.nodes, focusedNodeId).includes(id)) {
        focusedNodeId = id;
      }
      return {
        ...current,
        expandedIds,
        visibleIds: flattenVisible(current.nodes, current.childrenByParent, expandedIds),
        focusedNodeId,
      };
    });
  }

  return {
    getState: () => state,
    select: (selector) => selector(state),
    subscribe,
    createBinding<T>(selector: Selector<T>, equality: Equality<T> = strictEqual) {
      let selected = selector(state);
      return {
        getSnapshot: () => {
          const next = selector(state);
          if (!equality(selected, next)) {
            selected = next;
          }
          return selected;
        },
        subscribe: (listener) => subscribe(selector, listener, equality),
      };
    },
    update,
    setActiveNote,
    toggleExpanded,
    destroy: () => {
      destroyed = true;
      for (const subscriber of subscribers) {
        subscriber.active = false;
      }
      subscribers.clear();
    },
  };
}
