import type { BrowserSyncProgress } from "../../bridge/browser-sync";
import type { WorkspaceSyncStatus } from "../../bridge/commands";
import { formatByteSize } from "../../shared/lib/format-bytes";
import { blockedStateText } from "./sync-recovery";

/** Whether sync is currently linked, so the row offers pause instead of enable. */
export function syncEnabled(status: WorkspaceSyncStatus): boolean {
  return status.state !== "localOnly" && status.state !== "authenticationRequired";
}

/** One-line human description of the workspace sync state for the settings row. */
export function syncDescription(status: WorkspaceSyncStatus, browser: boolean): string {
  switch (status.state) {
    case "localOnly":
      return "Off. Notes stay only on this device until you enable sync.";
    case "connecting":
      return "Connecting this device securely…";
    case "upToDate":
      return "Up to date with your private cloud workspace.";
    case "pending":
      return "Local changes are waiting to upload.";
    case "offline":
      return "Offline. Changes remain local and will retry automatically.";
    case "authenticationRequired":
      return browser
        ? "Paused. Browser sign-in does not survive a reload; sign in and enable sync to reconnect."
        : "Paused. Enable sync again after signing in.";
    case "conflict":
      return `${status.openConflicts} sync conflict${status.openConflicts === 1 ? "" : "s"} need attention.`;
    case "retrying":
      return "Cloud is temporarily unavailable; retrying automatically.";
    case "blocked":
      return browser ? browserBlockedText(status.reason) : blockedStateText(status.reason);
  }
}

function browserBlockedText(reason: string): string {
  switch (reason) {
    case "push_conflict":
    case "protocol_mismatch":
    case "storage_failure":
      return blockedStateText(reason);
    default:
      return "Sync stopped because the cloud rejected a local change. Retry sync; reviewing individual blocked changes needs the desktop app for now.";
  }
}

/**
 * Hydration or transfer progress stays visible only while a cycle can still be
 * running; a settled state hides it so completion and failure both read
 * through the normal status line.
 */
export function syncProgressVisible(
  status: WorkspaceSyncStatus,
  connectPending: boolean,
): boolean {
  return connectPending || status.state === "connecting" || status.state === "pending";
}

const PROGRESS_PHASE_LABELS: Record<BrowserSyncProgress["phase"], string> = {
  hydrating: "Setting up this device from your cloud workspace",
  downloading: "Downloading changes",
  uploading: "Uploading changes",
};

/** Screen-reader-friendly text for one browser sync progress notification. */
export function syncProgressText(progress: BrowserSyncProgress): string {
  const bytes =
    progress.expectedBytes !== null
      ? `${formatByteSize(progress.transferredBytes)} of ${formatByteSize(progress.expectedBytes)}`
      : formatByteSize(progress.transferredBytes);
  const chunks =
    progress.expectedChunks !== null
      ? `${progress.transferredChunks} of ${progress.expectedChunks} chunks`
      : `${progress.transferredChunks} chunk${progress.transferredChunks === 1 ? "" : "s"}`;
  return `${PROGRESS_PHASE_LABELS[progress.phase]}: ${bytes} (${chunks}).`;
}
