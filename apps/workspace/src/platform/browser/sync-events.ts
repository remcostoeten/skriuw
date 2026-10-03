export type BrowserSyncProgress = {
  phase: "hydrating" | "downloading" | "uploading";
  transferredChunks: number;
  transferredBytes: number;
  expectedChunks: number | null;
  expectedBytes: number | null;
};

export type BrowserSyncChange = {
  noteIds: string[];
  structureChanged: boolean;
  full: boolean;
};

const progressListeners = new Set<(progress: BrowserSyncProgress) => void>();
const workspaceChangeListeners = new Set<(change: BrowserSyncChange) => void>();
const sessionExpiredListeners = new Set<() => void>();
let lastProgress: BrowserSyncProgress | null = null;

function isSyncProgress(value: unknown): value is BrowserSyncProgress {
  const progress = value as Partial<BrowserSyncProgress> | null;
  return (
    progress !== null &&
    typeof progress === "object" &&
    (progress.phase === "hydrating" ||
      progress.phase === "downloading" ||
      progress.phase === "uploading") &&
    typeof progress.transferredChunks === "number" &&
    typeof progress.transferredBytes === "number"
  );
}

/** Fed by the storage worker's out-of-band notifications. */
export function publishBrowserSyncEvent(value: unknown): void {
  if (!isSyncProgress(value)) return;
  lastProgress = value;
  for (const listener of progressListeners) listener(value);
}

/**
 * Hydration and transfer progress for shell surfaces. The worker posts these
 * while a sync request is still executing, so a first-connect checkpoint
 * hydration stays visible instead of appearing hung.
 */
export function subscribeBrowserSyncProgress(
  listener: (progress: BrowserSyncProgress) => void,
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

export function latestBrowserSyncProgress(): BrowserSyncProgress | null {
  return lastProgress;
}

/** Remote changes a cycle applied, in the same shape the desktop shell emits. */
export function subscribeBrowserWorkspaceChanges(
  listener: (change: BrowserSyncChange) => void,
): () => void {
  workspaceChangeListeners.add(listener);
  return () => {
    workspaceChangeListeners.delete(listener);
  };
}

/** Fires once the driver has discarded a session the cloud no longer accepts. */
export function subscribeBrowserSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

const resumeFailureListeners = new Set<() => void>();
let lastResumeFailure: string | null = null;

/**
 * Why the automatic reopen of a persisted session failed. Nothing is waiting on
 * that attempt, so without this its reason reached the console only and the
 * workspace described itself as an expired session whatever had gone wrong.
 */
export function latestBrowserResumeFailure(): string | null {
  return lastResumeFailure;
}

export function subscribeBrowserResumeFailure(listener: () => void): () => void {
  resumeFailureListeners.add(listener);
  return () => {
    resumeFailureListeners.delete(listener);
  };
}

export function publishResumeFailure(reason: string | null): void {
  if (lastResumeFailure === reason) return;
  lastResumeFailure = reason;
  for (const listener of resumeFailureListeners) listener();
}

function normalizeChange(
  changes: Partial<BrowserSyncChange> | null | undefined,
): BrowserSyncChange {
  return {
    noteIds: Array.isArray(changes?.noteIds)
      ? changes.noteIds.filter((id): id is string => typeof id === "string")
      : [],
    structureChanged: changes?.structureChanged === true,
    full: changes?.full === true,
  };
}

export function publishBrowserWorkspaceChange(
  changes: Partial<BrowserSyncChange> | null | undefined,
): void {
  const change = normalizeChange(changes);
  if (!change.full && !change.structureChanged && change.noteIds.length === 0) return;
  for (const listener of workspaceChangeListeners) listener(change);
}

export function publishBrowserSessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}
