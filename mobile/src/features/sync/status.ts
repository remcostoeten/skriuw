import type { WorkspaceSyncStatus } from "./port";

/**
 * How one sync state reads on a phone.
 *
 * The desktop settings row explains the same union in
 * `app/src/features/settings/sections/sync-status.ts`. The wording differs
 * here on purpose — a touch row has less space, and the actions a phone can
 * offer are not the desktop's — but the state names and the blocked reason
 * codes are the shared contract and are not reinterpreted.
 */

export type SyncTone = "synced" | "syncing" | "offline" | "attention";

/** What the account row offers next. Exactly one, never a list to choose from. */
export type SyncAction = "none" | "sign-in" | "resume" | "retry" | "review-blocked";

export type SyncPresentation = {
  summary: string;
  detail: string | null;
  tone: SyncTone;
  action: SyncAction;
};

/** Whether sync is linked, so the row offers pause rather than enable. */
export function syncEnabled(status: WorkspaceSyncStatus): boolean {
  return status.state !== "localOnly" && status.state !== "authenticationRequired";
}

export function describeSyncStatus(status: WorkspaceSyncStatus): SyncPresentation {
  switch (status.state) {
    case "localOnly":
      return {
        summary: "Sync paused",
        detail: "Notes stay on this device until you resume sync.",
        tone: "offline",
        action: "resume",
      };
    case "connecting":
      return {
        summary: "Connecting…",
        detail: "Linking this device to your private cloud workspace.",
        tone: "syncing",
        action: "none",
      };
    case "upToDate":
      return { summary: "All changes synced", detail: null, tone: "synced", action: "none" };
    case "pending":
      return {
        summary: "Uploading changes…",
        detail: "Local edits are waiting to upload.",
        tone: "syncing",
        action: "none",
      };
    case "offline":
      return {
        summary: "Offline",
        detail: "Changes stay on this device and upload when you are back online.",
        tone: "offline",
        action: "none",
      };
    case "authenticationRequired":
      return {
        summary: "Sign in again to sync",
        detail: "Your cloud session ended. Nothing on this device was removed.",
        tone: "attention",
        action: "sign-in",
      };
    case "rehydrating":
      return {
        summary: "Rebuilding from the cloud…",
        detail: "Downloading this account's workspace onto this device.",
        tone: "syncing",
        action: "none",
      };
    case "retrying":
      return {
        summary: "Cloud unavailable, retrying…",
        detail: "Nothing is lost; the next attempt runs automatically.",
        tone: "attention",
        action: "retry",
      };
    case "blocked":
      return {
        summary: "Sync stopped",
        detail: blockedStateText(status.reason, status.detail),
        tone: "attention",
        action: "review-blocked",
      };
  }
}

/**
 * Why the whole queue stopped. The reason codes come from
 * `skriuw-sync`; anything unrecognised falls back to the general case rather
 * than being shown raw, so a newer core cannot put an internal string in front
 * of the user.
 */
export function blockedStateText(reason: string, detail: string | null): string {
  switch (reason) {
    case "authorization_denied":
      return "The cloud denied access to this workspace. Review the blocked changes, then retry.";
    case "push_conflict":
      return "Another device uploaded a conflicting change. Retry to reconcile.";
    case "protocol_mismatch":
      return "This app and the cloud speak different sync protocols. Update Skriuw, then retry.";
    case "rejected_acknowledgement":
    case "rejected_checkpoint":
    case "rejected_batch":
      return "The cloud rejected the last upload. Review the blocked changes, then retry.";
    case "storage_failure":
      return "This device's sync queue hit a storage failure. Retry; if it persists, reinstall from your account.";
    case "encryption_key_required":
      return "This workspace is encrypted and this device has no key. Enter its recovery code.";
    case "encryption_downgrade_refused":
      return "The cloud returned unencrypted content for an encrypted workspace, and it was refused. Nothing was applied.";
    case "sealed_content_unreadable":
      return "The encrypted cloud copy could not be opened with this device's recovery code.";
    case "server_too_old":
      return "This Skriuw cloud is older than this app and cannot confirm the workspace key. Nothing was uploaded.";
    case "log_truncated":
    case "log_truncated_without_checkpoint":
      return "This device fell too far behind to catch up change by change. It rebuilds from the latest cloud checkpoint.";
    default: {
      const general = "The cloud rejected a local change. Review the blocked changes, then retry.";
      const bounded = detail?.trim() ?? "";
      return bounded.length === 0 ? general : `${general} ${bounded}`;
    }
  }
}
