import { commitGate } from "../../../../shared/renderer-core/src/store/commit-gate";
import { commitOperations, type WorkspaceSession } from "../../bridge/commit";
import { rearmBiometrics, type BiometricRearm } from "./biometrics";
import { isNodeLocked, lockedNodeIds, lockErrorMessage, sealedNoteIds } from "./lock-model";
import type { LockSession, NoteLockSecretInput, NoteLockState } from "./port";

/**
 * The session half of locked notes: the key is held in Rust, and this module
 * keeps the store's view of it honest.
 *
 * Opening the session pulls the opened bodies in as a delta; dropping it puts
 * the stored placeholders back. Both go through `applyRemoteDocuments`, which
 * is also what clears the editor webview: the host publishes a `remote-change`
 * for every document that moves, so a relock replaces the visible body with
 * the empty document the sealed row actually holds rather than asking the page
 * to forget it.
 *
 * The desktop twin is `app/src/features/lock/lock-session.ts`.
 */

export async function refreshNoteLock(session: LockSession): Promise<NoteLockState> {
  const state = await session.bridge.noteLockState();
  session.store.setNoteLock(state);
  return state;
}

/** Pulls the opened bodies of every sealed note into the store. */
export async function hydrateLockedDocuments(
  session: LockSession,
  noteIds: readonly string[] | null = null,
): Promise<void> {
  const ids = noteIds ?? sealedNoteIds(session.store.getState());
  if (ids.length === 0) {
    return;
  }
  const documents = await session.bridge.readLockedDocuments(ids);
  session.store.applyRemoteDocuments({ documents, nodes: [] });
}

/** Replaces opened bodies with their stored placeholders after the key is dropped. */
async function withholdLockedDocuments(session: LockSession): Promise<void> {
  const state = session.store.getState();
  const ids = lockedNodeIds(state).filter((id) => state.documents.has(id));
  if (ids.length === 0) {
    return;
  }
  const delta = await session.bridge.readWorkspaceDelta(ids);
  session.store.applyRemoteDocuments({ documents: delta.documents, nodes: [] });
}

export async function unlockNotes(session: LockSession, secret: string): Promise<NoteLockState> {
  const state = await session.bridge.unlockNoteLock(secret);
  session.store.setNoteLock(state);
  await hydrateLockedDocuments(session);
  return state;
}

/**
 * Recovery replaces the secret, so the keystore entry is re-wrapped in the
 * same step. `biometrics` is required rather than optional: an entry left
 * holding the old secret would spend the free attempts on every prompt.
 */
export async function recoverNotes(
  session: LockSession,
  recoveryCode: string,
  input: NoteLockSecretInput,
  biometrics: BiometricRearm,
): Promise<NoteLockState> {
  const state = await session.bridge.recoverNoteLock(recoveryCode, input);
  session.store.setNoteLock(state);
  await rearmBiometrics(biometrics, input.secret, session.reportFailure);
  await hydrateLockedDocuments(session);
  return state;
}

/** Returns the recovery code, which is shown once and never stored. */
export async function setUpNoteLock(
  session: LockSession,
  input: NoteLockSecretInput,
): Promise<string> {
  const recoveryCode = await session.bridge.configureNoteLock(input);
  await refreshNoteLock(session);
  return recoveryCode;
}

export async function changeNoteSecret(
  session: LockSession,
  input: NoteLockSecretInput,
  biometrics: BiometricRearm,
): Promise<NoteLockState> {
  const state = await session.bridge.changeNoteLockSecret(input);
  session.store.setNoteLock(state);
  await rearmBiometrics(biometrics, input.secret, session.reportFailure);
  return state;
}

/**
 * Drops the key and puts the placeholders back.
 *
 * Held across the commit gate rather than fired alongside pending work: a save
 * already on its way to SQLite settles first, and none starts while the
 * placeholders are being swapped in, so a body cannot be written after the key
 * is gone and the store cannot end up holding an opened body no session can
 * read. The desktop shell drains a pending-work registry for the same reason;
 * a phone has no window close to drain at, so the gate is the seam.
 */
export async function relockNotes(session: LockSession): Promise<void> {
  if (!session.store.getState().noteLock.unlocked) {
    return;
  }
  await commitGate.holdForReconcile(async () => {
    const state = await session.bridge.relockNoteLock();
    session.store.setNoteLock(state);
    await withholdLockedDocuments(session);
  });
}

/** Unlocks every locked note permanently, then deletes the configuration. */
export async function removeLock(
  session: LockSession,
  biometrics: BiometricRearm,
): Promise<void> {
  await commitGate.holdForReconcile(async () => {
    await session.bridge.removeNoteLock();
    await refreshNoteLock(session);
    const delta = await session.bridge.readWorkspaceDelta(
      lockedNodeIds(session.store.getState()),
    );
    session.store.applyRemoteDocuments(delta);
  });
  // The keystore would otherwise keep a secret for a lock that no longer
  // exists, ready to be offered against whatever lock is configured next.
  await rearmBiometrics(biometrics, null, session.reportFailure);
}

/**
 * What a lock or unlock write did, or what the screen has to ask for first.
 * Returned rather than dispatched: the surface that started the write decides
 * whether to raise the setup flow, the unlock screen, or a message.
 */
export type LockAction =
  | { status: "committed"; kind: "note" | "folder"; title: string; locked: boolean }
  | { status: "needsSetup" }
  | { status: "needsUnlock" }
  | { status: "refused"; message: string };

function requireSession(session: LockSession): LockAction | null {
  const lock = session.store.getState().noteLock;
  if (!lock.configured) {
    return { status: "needsSetup" };
  }
  if (!lock.unlocked) {
    return { status: "needsUnlock" };
  }
  return null;
}

/**
 * Flags a note or folder, sealing every plaintext body under it. The write
 * needs the key: a device without it refuses rather than flagging plaintext as
 * locked (ADR-0044).
 */
export async function setNodeLocked(
  session: WorkspaceSession,
  id: string,
  locked: boolean,
): Promise<LockAction> {
  const blocked = requireSession(session);
  if (blocked !== null) {
    return blocked;
  }
  const node = session.store.getState().nodes.get(id);
  if (!node) {
    return { status: "refused", message: "That item is no longer in the workspace." };
  }
  try {
    await commitOperations(session, [{ type: "set_node_locked", id, locked, at: Date.now() }]);
  } catch (error) {
    return { status: "refused", message: lockErrorMessage(error) };
  }
  return {
    status: "committed",
    kind: node.kind === "folder" ? "folder" : "note",
    title: node.title,
    locked,
  };
}

export function toggleNodeLock(session: WorkspaceSession, id: string): Promise<LockAction> {
  return setNodeLocked(session, id, !isNodeLocked(session.store.getState(), id));
}
