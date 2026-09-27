import { useSyncExternalStore } from "react";
import { listNoteShares, type NoteShare } from "./share-api";

export type NoteSharesState =
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "ready"; shares: ReadonlyMap<string, NoteShare> }
  | { status: "failed"; message: string };

let state: NoteSharesState = { status: "signed-out" };
let loadGeneration = 0;
const listeners = new Set<() => void>();

function setState(next: NoteSharesState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function noteSharesState(): NoteSharesState {
  return state;
}

export function subscribeNoteShares(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNoteShares(): NoteSharesState {
  return useSyncExternalStore(subscribeNoteShares, noteSharesState);
}

/**
 * Reads the signed-in account's shares from the server. The account, not this
 * device, owns them, so a share made on another device shows up here and a
 * newer sign-in discards an older answer that arrives late.
 */
export async function loadNoteShares(): Promise<void> {
  const generation = ++loadGeneration;
  if (state.status !== "ready") setState({ status: "loading" });
  try {
    const shares = await listNoteShares();
    if (generation !== loadGeneration) return;
    setState({ status: "ready", shares: new Map(shares.map((share) => [share.noteId, share])) });
  } catch (error) {
    if (generation !== loadGeneration) return;
    setState({
      status: "failed",
      message: error instanceof Error ? error.message : "Shared links could not be loaded.",
    });
  }
}

export function clearNoteShares(): void {
  loadGeneration += 1;
  setState({ status: "signed-out" });
}

export function rememberNoteShare(share: NoteShare): void {
  const shares = new Map(state.status === "ready" ? state.shares : []);
  shares.set(share.noteId, share);
  setState({ status: "ready", shares });
}

export function forgetNoteShare(noteId: string): void {
  if (state.status !== "ready" || !state.shares.has(noteId)) return;
  const shares = new Map(state.shares);
  shares.delete(noteId);
  setState({ status: "ready", shares });
}
