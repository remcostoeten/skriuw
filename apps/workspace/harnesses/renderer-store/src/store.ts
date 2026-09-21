import { ancestorIds, buildNodeIndex, flattenVisible } from "./tree";
import type {
  Equality,
  Listener,
  RendererState,
  RendererStore,
  Selector,
  StoreDiagnostics,
  TreeProjection,
} from "./types";

type Subscriber<T = unknown> = {
  active: boolean;
  selector: Selector<T>;
  equality: Equality<T>;
  selected: T;
  listener: Listener;
};

const strictEqual = <T,>(left: T, right: T) => Object.is(left, right);

export function createInitialState(projection: TreeProjection): RendererState {
  const index = buildNodeIndex(projection.nodes);
  const expandedIds = new Set(
    projection.nodes.filter((node) => node.kind === "folder").map((node) => node.id),
  );
  const documents = new Map<string, { id: string; preparedIdentity: string }>();
  const metadata = new Map<
    string,
    { title: string; wordCount: number; updatedAt: string }
  >();
  for (const node of projection.nodes) {
    if (node.kind === "note") {
      documents.set(node.id, { id: node.id, preparedIdentity: `prepared:${node.id}` });
      metadata.set(node.id, {
        title: node.title,
        wordCount: 48 + (documents.size % 173),
        updatedAt: "21 Jul 2026, 14:32",
      });
    }
  }
  const disabledIds = new Set(
    projection.nodes
      .filter((node, position) => node.kind === "note" && position > 0 && position % 997 === 0)
      .map((node) => node.id),
  );
  const fallbackActiveNoteId = [...documents.keys()].find((id) => !disabledIds.has(id)) ?? null;
  const activeNoteId =
    projection.activeNoteId && !disabledIds.has(projection.activeNoteId)
      ? projection.activeNoteId
      : fallbackActiveNoteId;
  return {
    ...index,
    visibleIds: flattenVisible(index.nodes, index.childrenByParent, expandedIds),
    expandedIds,
    disabledIds,
    activeNoteId,
    focusedNodeId: activeNoteId,
    documents,
    metadata,
    settingsSelection: "workspace",
  };
}

export function createRendererStore(initialState: RendererState): RendererStore {
  let state = initialState;
  let destroyed = false;
  const subscribers = new Set<Subscriber>();
  const counters: StoreDiagnostics = {
    notifications: 0,
    selectorEvaluations: 0,
    updateAttempts: 0,
    effectiveUpdates: 0,
    listenerCount: 0,
    peakListenerCount: 0,
    listenerFailures: 0,
  };
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
    counters.listenerCount = subscribers.size;
    counters.peakListenerCount = Math.max(counters.peakListenerCount, subscribers.size);
    return () => {
      if (!subscriber.active) {
        return;
      }
      subscriber.active = false;
      subscribers.delete(subscriber as Subscriber);
      counters.listenerCount = subscribers.size;
    };
  }

  function update(updater: (current: RendererState) => RendererState): boolean {
    if (destroyed) {
      throw new Error("renderer store is destroyed");
    }
    counters.updateAttempts += 1;
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
      counters.effectiveUpdates += 1;
      for (const subscriber of [...subscribers]) {
        if (!subscriber.active) {
          continue;
        }
        let selected: unknown;
        try {
          counters.selectorEvaluations += 1;
          selected = subscriber.selector(state);
          if (subscriber.equality(subscriber.selected, selected)) {
            continue;
          }
        } catch (error) {
          counters.listenerFailures += 1;
          failures.push(error);
          continue;
        }
        subscriber.selected = selected;
        counters.notifications += 1;
        try {
          subscriber.listener();
        } catch (error) {
          counters.listenerFailures += 1;
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
      if (id !== null && (!current.documents.has(id) || current.disabledIds.has(id))) {
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
        activeNoteId: current.activeNoteId,
        focusedNodeId,
      };
    });
  }

  function setMetadataTitle(id: string, title: string): boolean {
    return update((current) => {
      const existing = current.metadata.get(id);
      if (!existing || existing.title === title) {
        return current;
      }
      const metadata = new Map(current.metadata);
      metadata.set(id, { ...existing, title });
      return { ...current, metadata };
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
    setMetadataTitle,
    diagnostics: () => ({ ...counters, listenerCount: subscribers.size }),
    resetDiagnostics: () => {
      counters.notifications = 0;
      counters.selectorEvaluations = 0;
      counters.updateAttempts = 0;
      counters.effectiveUpdates = 0;
      counters.listenerFailures = 0;
      counters.peakListenerCount = subscribers.size;
    },
    destroy: () => {
      destroyed = true;
      for (const subscriber of subscribers) {
        subscriber.active = false;
      }
      subscribers.clear();
      counters.listenerCount = 0;
    },
  };
}
