import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { noop } from "@skriuw/shared/helpers/noop";
import { showToast } from "@/shared/ui/toast";
import { revokeNoteShare } from "./share-api";
import { forgetNoteShare, noteSharesState, subscribeNoteShares } from "./share-registry";

export const REVOKE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 10 * 60_000;
const STORAGE_PREFIX = "skriuw:share-revocations:v1:";

type PendingRevocation = {
  shareId: string;
  noteId: string;
  title: string;
};

type Options = {
  accountId: string;
  revoke?: typeof revokeNoteShare;
  notify?: typeof showToast;
  retryMs?: number;
  storage?: Storage | null;
};

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parsePending(raw: string | null): PendingRevocation[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      "shareId" in entry &&
      "noteId" in entry &&
      "title" in entry &&
      typeof entry.shareId === "string" &&
      typeof entry.noteId === "string" &&
      typeof entry.title === "string"
        ? [{ shareId: entry.shareId, noteId: entry.noteId, title: entry.title }]
        : [],
    );
  } catch {
    return [];
  }
}

/**
 * @name isNoteWithdrawn
 * @description True when a note still exists in the workspace but sits in the
 * trash, directly or under a trashed folder. A note this device has never seen
 * is not withdrawn, because the account's shares can come from other devices.
 *
 * @example
 * if (isNoteWithdrawn(store.getState(), share.noteId)) revoke(share.id);
 */
export function isNoteWithdrawn(state: RendererState, noteId: string): boolean {
  return state.sourceNodes.has(noteId) && !state.nodes.has(noteId);
}

/**
 * @name startTrashedShareRevoker
 * @description Stops sharing notes that move to the trash, alone or inside a
 * folder. The link disappears from the share registry in the same tick; the
 * DELETE runs in the background and is remembered per account until the
 * server confirms it, so an offline or failed revoke is retried with backoff,
 * when the device comes back online, and on the next start. Restoring a note
 * never publishes it again.
 *
 * @example
 * const stop = startTrashedShareRevoker(store, { accountId: user.id });
 */
export function startTrashedShareRevoker(store: RendererStore, options: Options): () => void {
  const revoke = options.revoke ?? revokeNoteShare;
  const notify = options.notify ?? showToast;
  const retryMs = options.retryMs ?? REVOKE_RETRY_MS;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const storageKey = `${STORAGE_PREFIX}${options.accountId}`;
  const pending = new Map(
    parsePending(readStorage()).map((entry) => [entry.shareId, entry] as const),
  );
  const inFlight = new Set<string>();
  let failures = 0;
  let warned = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function readStorage(): string | null {
    try {
      return storage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  }

  function persist(): void {
    try {
      if (pending.size === 0) storage?.removeItem(storageKey);
      else storage?.setItem(storageKey, JSON.stringify([...pending.values()]));
    } catch {
      noop();
    }
  }

  function scheduleRetry(): void {
    if (stopped || retryTimer !== undefined || pending.size === 0) return;
    const delay = Math.min(retryMs * 2 ** Math.max(failures - 1, 0), MAX_RETRY_MS);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      retryAll();
    }, delay);
  }

  function retryAll(): void {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    for (const shareId of pending.keys()) void attempt(shareId);
  }

  async function attempt(shareId: string): Promise<void> {
    const entry = pending.get(shareId);
    if (stopped || !entry || inFlight.has(shareId)) return;
    inFlight.add(shareId);
    try {
      await revoke(shareId);
      pending.delete(shareId);
      persist();
      if (pending.size === 0) {
        failures = 0;
        warned = false;
      }
    } catch (error) {
      console.error("revoking a trashed note's share failed", error);
      failures += 1;
      if (!warned && !stopped) {
        warned = true;
        notify({
          message: `"${entry.title || "Untitled"}" is still public`,
          description: `It moved to the trash but its link couldn't be removed${
            error instanceof Error ? `: ${error.message}` : "."
          } Skriuw keeps retrying.`,
          durationMs: 15_000,
          action: { label: "Retry", run: retryAll },
        });
      }
      scheduleRetry();
    } finally {
      inFlight.delete(shareId);
    }
  }

  function reconcile(): void {
    const shares = noteSharesState();
    if (shares.status !== "ready") return;
    const state = store.getState();
    const queued: string[] = [];
    const hidden: string[] = [];
    for (const share of shares.shares.values()) {
      if (pending.has(share.id)) {
        hidden.push(share.noteId);
      } else if (isNoteWithdrawn(state, share.noteId)) {
        pending.set(share.id, {
          shareId: share.id,
          noteId: share.noteId,
          title: state.sourceNodes.get(share.noteId)?.title ?? "",
        });
        queued.push(share.id);
        hidden.push(share.noteId);
      }
    }
    if (queued.length > 0) persist();
    for (const noteId of hidden) forgetNoteShare(noteId);
    for (const shareId of queued) void attempt(shareId);
  }

  const target = typeof window === "undefined" ? null : window;
  target?.addEventListener("online", retryAll);
  const unsubscribers = [
    subscribeNoteShares(reconcile),
    store.subscribe((current) => current.nodes, reconcile),
  ];
  reconcile();
  retryAll();
  return () => {
    stopped = true;
    target?.removeEventListener("online", retryAll);
    for (const unsubscribe of unsubscribers) unsubscribe();
    clearTimeout(retryTimer);
  };
}
