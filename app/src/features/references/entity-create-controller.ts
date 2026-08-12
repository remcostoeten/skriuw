import type { EntityKind } from "./entity-manager-model";

type EntityCreateListener = () => void;

const listeners = new Map<EntityKind, EntityCreateListener>();
const pending = new Set<EntityKind>();

export function registerEntityCreate(
  kind: EntityKind,
  listener: EntityCreateListener,
): () => void {
  listeners.set(kind, listener);
  if (pending.has(kind)) {
    pending.delete(kind);
    listener();
  }
  return () => {
    if (listeners.get(kind) === listener) {
      listeners.delete(kind);
    }
  };
}

/**
 * Opens the create form for the given entity kind. When no view is mounted yet
 * (e.g. the palette navigated to the route this frame), the request is queued
 * and replayed once the matching {@link registerEntityCreate} runs.
 */
export function requestEntityCreate(kind: EntityKind): void {
  const listener = listeners.get(kind);
  if (listener) {
    listener();
  } else {
    pending.add(kind);
  }
}
