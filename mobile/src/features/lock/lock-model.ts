import type {
  NoteLockKind,
  NoteLockState,
  WorkspaceSettings,
} from "../../../../shared/renderer-core/src/contracts/workspace";
import type { RendererState } from "../../../../shared/renderer-core/src/store/types";

/**
 * The rules a lock secret is held to, and how one lock state reads.
 *
 * Every constant and every check here mirrors `validate_note_lock_secret` in
 * `crates/skriuw-domain/src/lock.rs`, which is the authority: the backend
 * refuses the same inputs whichever client typed them, and this file only
 * moves the refusal to the keyboard. The desktop twin is
 * `app/src/features/lock/lock-model.ts`; the wording differs where a phone has
 * less room, the semantics do not.
 *
 * The retry schedule is deliberately absent. `nextAttemptAt` comes from the
 * backend that counts the attempts, so there is one clock and one table, and a
 * phone cannot present a delay the storage layer would not enforce.
 */

export const MIN_PIN_DIGITS = 4;
export const MIN_PASSPHRASE_CHARS = 6;
export const MAX_SECRET_BYTES = 256;
export const MAX_HINT_CHARS = 120;

/** The attempts answered without a delay, per `NOTE_LOCK_FREE_ATTEMPTS`. */
export const FREE_UNLOCK_ATTEMPTS = 3;

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export const AUTO_LOCK_OPTIONS = [
  { minutes: 0, label: "Never" },
  { minutes: 1, label: "After 1 minute" },
  { minutes: 5, label: "After 5 minutes" },
  { minutes: 15, label: "After 15 minutes" },
  { minutes: 30, label: "After 30 minutes" },
] as const;

export function secretNoun(kind: NoteLockKind | null): string {
  return kind === "passphrase" ? "passphrase" : "PIN";
}

/**
 * UTF-8 length without `TextEncoder`. Rust bounds the secret in bytes, and
 * Hermes cannot be relied on to carry the web encoder on every supported
 * engine version, so the count is done here rather than guarded for.
 */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Code points, the unit `chars().count()` counts in on the Rust side. */
function characterCount(value: string): number {
  let count = 0;
  for (const _character of value) {
    count += 1;
  }
  return count;
}

export function validateSecret(kind: NoteLockKind, secret: string): string | null {
  if (utf8ByteLength(secret) > MAX_SECRET_BYTES) {
    return `Keep the ${secretNoun(kind)} under ${MAX_SECRET_BYTES} bytes.`;
  }
  if (kind === "pin") {
    if (characterCount(secret) < MIN_PIN_DIGITS) {
      return `A PIN needs at least ${MIN_PIN_DIGITS} digits.`;
    }
    if (!/^\d+$/.test(secret)) {
      return "A PIN contains digits only.";
    }
    return null;
  }
  if (characterCount(secret.trim()) < MIN_PASSPHRASE_CHARS) {
    return `A passphrase needs at least ${MIN_PASSPHRASE_CHARS} characters.`;
  }
  return null;
}

export function validateHint(hint: string): string | null {
  if (characterCount(hint.trim()) > MAX_HINT_CHARS) {
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

/** The whole secret form in one value, so setup, change and recovery share it. */
export type SecretDraft = {
  kind: NoteLockKind;
  secret: string;
  confirm: string;
  hint: string;
};

export function emptySecretDraft(kind: NoteLockKind = "pin"): SecretDraft {
  return { kind, secret: "", confirm: "", hint: "" };
}

export function secretDraftError(draft: SecretDraft): string | null {
  const secretError = validateSecret(draft.kind, draft.secret);
  if (secretError !== null) {
    return secretError;
  }
  if (draft.secret !== draft.confirm) {
    return `The two ${secretNoun(draft.kind)} entries differ.`;
  }
  const hintError = validateHint(draft.hint);
  if (hintError !== null) {
    return hintError;
  }
  if (hintRevealsSecret(draft.hint, draft.secret)) {
    return `The hint contains the ${secretNoun(draft.kind)} itself.`;
  }
  return null;
}

/**
 * The Crockford grouping the sync recovery code already uses
 * (`app/src/features/settings/sections/sync-encryption.ts`). A lock recovery
 * code is 160 bits in the same form (ADR-0044), so it is typed the same way.
 */
export function normalizeRecoveryCodeInput(value: string): string {
  const symbols = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 32);
  return (symbols.match(/.{1,4}/g) ?? []).join("-");
}

export function recoveryCodeLooksComplete(value: string): boolean {
  return value.replace(/[^0-9A-Za-z]/g, "").length === 32;
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

export type UnlockPresentation = {
  /** Hidden until the first miss, so a glance at the screen never reveals it. */
  showHint: boolean;
  waitMs: number;
  throttled: boolean;
  attemptsLeftBeforeDelay: number;
};

export function unlockPresentation(lock: NoteLockState, now: number): UnlockPresentation {
  const waitMs = retryWaitMs(lock, now);
  return {
    showHint: lock.hint !== null && lock.failedAttempts > 0,
    waitMs,
    throttled: waitMs > 0,
    attemptsLeftBeforeDelay: Math.max(0, FREE_UNLOCK_ATTEMPTS - lock.failedAttempts),
  };
}

/** The backend's refusals carry an operation prefix the screen has no use for. */
export function lockErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^(?:Error: )?invalid workspace operation: /, "");
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

export function autoLockMinutes(settings: WorkspaceSettings): number {
  const value: unknown = settings.autoLockMinutes;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  return value;
}
