import type { NoteLockKind, NoteLockState } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState } from "@skriuw/renderer-core/store/types";

export { autoLockMinutes, locksOnBlur } from "@/features/settings/settings-model";

export const MIN_PIN_DIGITS = 4;
export const MIN_PASSPHRASE_CHARS = 6;
export const MAX_SECRET_BYTES = 256;
export const MAX_HINT_CHARS = 120;

export const AUTO_LOCK_OPTIONS = [
  { value: "0", label: "Never" },
  { value: "1", label: "After 1 minute" },
  { value: "5", label: "After 5 minutes" },
  { value: "15", label: "After 15 minutes" },
  { value: "30", label: "After 30 minutes" },
] as const;

export type AutoLockChoice = (typeof AUTO_LOCK_OPTIONS)[number]["value"];

export function secretNoun(kind: NoteLockKind | null): string {
  return kind === "passphrase" ? "passphrase" : "PIN";
}

/** Mirrors `validate_note_lock_secret` so the dialog refuses what the backend would. */
export function validateSecret(kind: NoteLockKind, secret: string): string | null {
  if (new TextEncoder().encode(secret).length > MAX_SECRET_BYTES) {
    return `Keep the ${secretNoun(kind)} under ${MAX_SECRET_BYTES} bytes.`;
  }
  if (kind === "pin") {
    if (secret.length < MIN_PIN_DIGITS) {
      return `A PIN needs at least ${MIN_PIN_DIGITS} digits.`;
    }
    if (!/^\d+$/.test(secret)) {
      return "A PIN contains digits only.";
    }
    return null;
  }
  if (secret.trim().length < MIN_PASSPHRASE_CHARS) {
    return `A passphrase needs at least ${MIN_PASSPHRASE_CHARS} characters.`;
  }
  return null;
}

export function validateHint(hint: string): string | null {
  if (hint.trim().length > MAX_HINT_CHARS) {
    return `Keep the hint under ${MAX_HINT_CHARS} characters.`;
  }
  return null;
}

/** A hint that gives the secret away is worse than none. */
export function hintRevealsSecret(hint: string, secret: string): boolean {
  const normalizedHint = hint.trim().toLowerCase();
  const normalizedSecret = secret.trim().toLowerCase();
  return normalizedSecret.length > 0 && normalizedHint.includes(normalizedSecret);
}

export function normalizeHint(hint: string): string | null {
  const trimmed = hint.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function formatWait(remainingMs: number): string {
  if (remainingMs >= 60_000) {
    const minutes = Math.ceil(remainingMs / 60_000);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const seconds = Math.max(1, Math.ceil(remainingMs / 1_000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/** Milliseconds until the next unlock attempt is allowed, or zero. */
export function retryWaitMs(lock: NoteLockState, now: number): number {
  return lock.nextAttemptAt === null ? 0 : Math.max(0, lock.nextAttemptAt - now);
}

export function isNodeLocked(state: RendererState, id: string): boolean {
  return (state.sourceNodes.get(id)?.lockedAt ?? null) !== null;
}

/** Whether the note's body is withheld from this session right now. */
export function isNoteSealed(state: RendererState, id: string): boolean {
  return (state.documents.get(id)?.sealed ?? null) !== null;
}

export function sealedNoteIds(state: RendererState): string[] {
  const ids: string[] = [];
  for (const document of state.documents.values()) {
    if ((document.sealed ?? null) !== null) {
      ids.push(document.noteId);
    }
  }
  return ids;
}

export function lockedNodeIds(state: RendererState): string[] {
  const ids: string[] = [];
  for (const node of state.sourceNodes.values()) {
    if ((node.lockedAt ?? null) !== null) {
      ids.push(node.id);
    }
  }
  return ids;
}


/** The lock request a dialog opens for, and what to run once the session can proceed. */
export type LockDialogRequest =
  | { kind: "setup"; then?: () => void }
  | { kind: "unlock"; then?: () => void }
  | { kind: "change" };

export type UnlockPhase = "secret" | "recovery";

/**
 * Which unlock affordances to show for the current lock state. The hint stays
 * hidden until the first miss so it never gives the secret away to a glance.
 */
export function unlockPresentation(lock: NoteLockState, now: number) {
  const waitMs = retryWaitMs(lock, now);
  return {
    showHint: lock.hint !== null && lock.failedAttempts > 0,
    waitMs,
    throttled: waitMs > 0,
    attemptsLeftBeforeDelay: Math.max(0, 3 - lock.failedAttempts),
  };
}
