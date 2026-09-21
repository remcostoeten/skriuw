import {
  changeNoteLockSecret,
  configureNoteLock,
  noteLockState,
  readLockedDocuments,
  readWorkspaceDelta,
  recoverNoteLock,
  relockNoteLock,
  removeNoteLock,
  unlockNoteLock,
} from "@/bridge/commands";
import type { NoteLockSecretInput } from "@skriuw/renderer-core/bridge/port";
import type { NoteLockState } from "@skriuw/renderer-core/contracts/workspace";
import { commitOperations } from "@/store/actions/workspace";
import { flushPendingWork } from "@/shell/pending-work";
import { showToast } from "@/shared/ui/toast";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { requestLockDialog } from "./lock-dialog-controller";
import {
  autoLockMinutes,
  isNodeLocked,
  lockedNodeIds,
  locksOnBlur,
  sealedNoteIds,
} from "./lock-model";

export async function refreshNoteLock(store: RendererStore): Promise<NoteLockState> {
  const state = await noteLockState();
  store.setNoteLock(state);
  return state;
}

/** Pulls the opened bodies of every sealed note into the store. */
export async function hydrateLockedDocuments(
  store: RendererStore,
  noteIds: readonly string[] | null = null,
): Promise<void> {
  const ids = noteIds ?? sealedNoteIds(store.getState());
  if (ids.length === 0) {
    return;
  }
  const documents = await readLockedDocuments(ids);
  store.applyRemoteDocuments({ documents, nodes: [] });
}

/** Replaces opened bodies with their stored placeholders after the key is dropped. */
async function withholdLockedDocuments(store: RendererStore): Promise<void> {
  const ids = lockedNodeIds(store.getState()).filter((id) => store.getState().documents.has(id));
  if (ids.length === 0) {
    return;
  }
  const delta = await readWorkspaceDelta(ids);
  store.applyRemoteDocuments({ documents: delta.documents, nodes: [] });
}

export async function unlockNotes(store: RendererStore, secret: string): Promise<NoteLockState> {
  const state = await unlockNoteLock(secret);
  store.setNoteLock(state);
  await hydrateLockedDocuments(store);
  return state;
}

export async function recoverNotes(
  store: RendererStore,
  recoveryCode: string,
  input: NoteLockSecretInput,
): Promise<NoteLockState> {
  const state = await recoverNoteLock(recoveryCode, input);
  store.setNoteLock(state);
  await hydrateLockedDocuments(store);
  return state;
}

export async function setUpNoteLock(
  store: RendererStore,
  input: NoteLockSecretInput,
): Promise<string> {
  const recoveryCode = await configureNoteLock(input);
  await refreshNoteLock(store);
  return recoveryCode;
}

export async function changeNoteSecret(
  store: RendererStore,
  input: NoteLockSecretInput,
): Promise<NoteLockState> {
  const state = await changeNoteLockSecret(input);
  store.setNoteLock(state);
  return state;
}

export async function relockNotes(store: RendererStore): Promise<void> {
  if (!store.getState().noteLock.unlocked) {
    return;
  }
  await flushPendingWork();
  const state = await relockNoteLock();
  store.setNoteLock(state);
  await withholdLockedDocuments(store);
}

export async function removeLock(store: RendererStore): Promise<void> {
  await flushPendingWork();
  await removeNoteLock();
  await refreshNoteLock(store);
  const ids = lockedNodeIds(store.getState());
  const delta = await readWorkspaceDelta(ids);
  store.applyRemoteDocuments(delta);
}

function reportFailure(action: string) {
  return (error: unknown) => {
    console.error(`${action} failed`, error);
    showToast({ message: `${action} failed. ${String(error)}` });
  };
}

/**
 * Runs `action` once the session can seal and open bodies: sets up the lock
 * first when none exists, asks for the secret when the session is locked.
 */
export function withUnlockedSession(store: RendererStore, action: () => void): void {
  const lock = store.getState().noteLock;
  if (!lock.configured) {
    requestLockDialog({ kind: "setup", onReady: action });
    return;
  }
  if (!lock.unlocked) {
    requestLockDialog({ kind: "unlock", onReady: action });
    return;
  }
  action();
}

export function lockNode(store: RendererStore, id: string): void {
  withUnlockedSession(store, () => {
    const node = store.getState().nodes.get(id);
    if (!node) {
      return;
    }
    void commitOperations(store, [{ type: "set_node_locked", id, locked: true, at: Date.now() }])
      .then(() => {
        showToast({ message: node.kind === "folder" ? "Folder locked" : "Note locked" });
      })
      .catch(reportFailure("Locking"));
  });
}

export function unlockNodeForever(store: RendererStore, id: string): void {
  withUnlockedSession(store, () => {
    const node = store.getState().nodes.get(id);
    if (!node) {
      return;
    }
    void commitOperations(store, [{ type: "set_node_locked", id, locked: false, at: Date.now() }])
      .then(() => {
        showToast({ message: node.kind === "folder" ? "Folder unlocked" : "Note unlocked" });
      })
      .catch(reportFailure("Unlocking"));
  });
}

export function toggleNodeLock(store: RendererStore, id: string): void {
  if (isNodeLocked(store.getState(), id)) {
    unlockNodeForever(store, id);
  } else {
    lockNode(store, id);
  }
}

export function requestSessionUnlock(): void {
  requestLockDialog({ kind: "unlock" });
}

type LockSessionDependencies = {
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<Document, "addEventListener" | "removeEventListener">;
  timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
  relock: (store: RendererStore) => Promise<void>;
  hydrate: (store: RendererStore) => Promise<void>;
  refresh: (store: RendererStore) => Promise<unknown>;
  onError: (context: string, error: unknown) => void;
};

function defaultDependencies(overrides: Partial<LockSessionDependencies>): LockSessionDependencies {
  return {
    window: overrides.window ?? window,
    document: overrides.document ?? document,
    timers: overrides.timers ?? globalThis,
    relock: overrides.relock ?? relockNotes,
    hydrate: overrides.hydrate ?? ((store) => hydrateLockedDocuments(store)),
    refresh: overrides.refresh ?? refreshNoteLock,
    onError: overrides.onError ?? ((context, error) => console.error(`${context} failed`, error)),
  };
}

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel"] as const;

function selectSessionFacts(state: RendererState) {
  return {
    unlocked: state.noteLock.unlocked,
    sealedCount: sealedNoteIds(state).length,
    autoLockMinutes: autoLockMinutes(state.settings),
    lockOnBlur: locksOnBlur(state.settings),
  };
}

type SessionFacts = ReturnType<typeof selectSessionFacts>;

function sameFacts(left: SessionFacts, right: SessionFacts): boolean {
  return (
    left.unlocked === right.unlocked &&
    left.sealedCount === right.sealedCount &&
    left.autoLockMinutes === right.autoLockMinutes &&
    left.lockOnBlur === right.lockOnBlur
  );
}

/**
 * Keeps the renderer's view of locked notes in step with the session: opened
 * bodies are fetched whenever sealed placeholders appear while the key is
 * held (after a sync delta or a re-bootstrap), and the key is dropped after
 * the configured idle time or when the window loses focus.
 */
export function bindLockSession(
  store: RendererStore,
  overrides: Partial<LockSessionDependencies> = {},
): () => void {
  const deps = defaultDependencies(overrides);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrating = false;

  function clearIdleTimer(): void {
    if (idleTimer !== null) {
      deps.timers.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function relock(): void {
    void deps.relock(store).catch((error) => deps.onError("auto-lock", error));
  }

  function armIdleTimer(): void {
    clearIdleTimer();
    const facts = selectSessionFacts(store.getState());
    if (!facts.unlocked || facts.autoLockMinutes <= 0) {
      return;
    }
    idleTimer = deps.timers.setTimeout(relock, facts.autoLockMinutes * 60_000);
  }

  function hydrateIfNeeded(): void {
    const facts = selectSessionFacts(store.getState());
    if (!facts.unlocked || facts.sealedCount === 0 || hydrating) {
      return;
    }
    hydrating = true;
    void deps
      .hydrate(store)
      .catch((error) => deps.onError("locked note hydration", error))
      .finally(() => {
        hydrating = false;
      });
  }

  function onActivity(): void {
    if (idleTimer !== null) {
      armIdleTimer();
    }
  }

  function onBlur(): void {
    if (selectSessionFacts(store.getState()).lockOnBlur) {
      relock();
    }
  }

  const unsubscribe = store.subscribe(
    selectSessionFacts,
    () => {
      hydrateIfNeeded();
      armIdleTimer();
    },
    sameFacts,
  );
  for (const event of ACTIVITY_EVENTS) {
    deps.document.addEventListener(event, onActivity, { passive: true });
  }
  deps.window.addEventListener("blur", onBlur);
  void deps.refresh(store).catch((error) => deps.onError("note lock refresh", error));
  hydrateIfNeeded();
  armIdleTimer();

  return () => {
    unsubscribe();
    clearIdleTimer();
    for (const event of ACTIVITY_EVENTS) {
      deps.document.removeEventListener(event, onActivity);
    }
    deps.window.removeEventListener("blur", onBlur);
  };
}
