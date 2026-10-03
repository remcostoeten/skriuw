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
} from "@/platform/runtime/commands";
import type { NoteLockSecretInput } from "@skriuw/renderer-core/bridge/port";
import type { NoteLockState } from "@skriuw/renderer-core/contracts/workspace";
import { flushPendingWork } from "@/store/pending-work";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { lockedNodeIds, sealedNoteIds } from "../state/model";

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
