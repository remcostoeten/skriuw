import { commitOperations } from "@/store/commit";
import { showToast } from "@/shared/ui/toast";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { isNodeLocked } from "../state/model";
import { relockNotes } from "./backend";
import { requestLockDialog } from "./dialog-requests";

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
      .then(() => relockNotes(store))
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
