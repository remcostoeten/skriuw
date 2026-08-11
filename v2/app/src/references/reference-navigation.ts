import { appRouteHash, entityFocusHash } from "@/app-route";
import type { RendererStore } from "@/store/types";
import type { ReferenceKind } from "./types";

type NavLocation = {
  hash: string;
  activeNoteId: string | null;
};

const backStack: NavLocation[] = [];

function currentLocation(store: RendererStore): NavLocation {
  return {
    hash: window.location.hash || appRouteHash("notes"),
    activeNoteId: store.getState().activeNoteId,
  };
}

/**
 * Follows a resolved reference, pushing the current location so a later
 * `navigateBack` can return the reader to where the jump started. Note refs
 * open the target note; tag/person refs deep-link to the entity's page.
 */
export function activateReference(
  store: RendererStore,
  kind: ReferenceKind,
  targetId: string,
): void {
  backStack.push(currentLocation(store));
  if (kind === "note") {
    store.setActiveNote(targetId);
    window.location.hash = appRouteHash("notes");
    return;
  }
  window.location.hash = entityFocusHash(kind, targetId);
}

export function canNavigateBack(): boolean {
  return backStack.length > 0;
}

export function navigateBack(store: RendererStore): boolean {
  const previous = backStack.pop();
  if (!previous) {
    return false;
  }
  store.setActiveNote(previous.activeNoteId);
  window.location.hash = previous.hash;
  return true;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Installs a global Backspace handler that pops the reference back-stack, so a
 * reader who followed a link can return with a single key. Ignored while typing.
 */
export function installBackNavigation(store: RendererStore): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.key !== "Backspace" || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (backStack.length === 0 || isTypingTarget(event.target)) {
      return;
    }
    event.preventDefault();
    navigateBack(store);
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
