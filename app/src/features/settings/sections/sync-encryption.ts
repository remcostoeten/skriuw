import type { WorkspaceEncryptionState, WorkspaceSyncStatus } from "@/bridge/commands";

/** Blocked sync reasons that only a recovery code can clear. */
export const ENCRYPTION_KEY_REQUIRED_REASON = "encryption_key_required";
export const SEALED_CONTENT_UNREADABLE_REASON = "sealed_content_unreadable";

export type EncryptionStage =
  /** The workspace is not linked to the cloud, so there is nothing to encrypt. */
  | "unlinked"
  /** Linked and replicating in the clear. */
  | "off"
  /** Just enabled: the recovery code is on screen and shown only now. */
  | "revealed"
  /** Encrypted, and this device holds the key. */
  | "on"
  /** Encrypted by another device; this one needs the recovery code. */
  | "locked";

export function encryptionStage(
  state: WorkspaceEncryptionState | null,
  status: WorkspaceSyncStatus,
  revealedRecoveryCode: string | null,
): EncryptionStage {
  if (revealedRecoveryCode !== null) return "revealed";
  if (state === null || !state.linked) return "unlinked";
  if (state.enabled) return "on";
  return encryptionKeyRequired(status) ? "locked" : "off";
}

/** Whether the current sync state is stopped for want of a workspace key. */
export function encryptionKeyRequired(status: WorkspaceSyncStatus): boolean {
  return (
    status.state === "blocked" &&
    (status.reason === ENCRYPTION_KEY_REQUIRED_REASON ||
      status.reason === SEALED_CONTENT_UNREADABLE_REASON)
  );
}

export function encryptionDescription(stage: EncryptionStage): string {
  switch (stage) {
    case "unlinked":
      return "Connect this workspace to Skriuw cloud to encrypt what it uploads.";
    case "off":
      return "Your cloud copy is readable by the sync service. Encrypt it so only your devices can open it.";
    case "revealed":
      return "Write this code down now. It is the only way to open your cloud copy on another device, and it is never shown again.";
    case "on":
      return "Note titles, bodies, tags, people, and media are sealed before they leave this device.";
    case "locked":
      return "Another device encrypted this workspace. Enter its recovery code to keep syncing here.";
  }
}

/** Whether the enable action should be offered and usable right now. */
export function canEnableEncryption(
  state: WorkspaceEncryptionState | null,
  status: WorkspaceSyncStatus,
): boolean {
  return encryptionStage(state, status, null) === "off";
}

/**
 * Accepts a code the user typed or pasted in any grouping and case, and
 * returns the canonical form the backend parses. Only the alphabet's symbols
 * survive, so pasted whitespace and stray separators are harmless.
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
