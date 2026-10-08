import { SkriuwCoreError, toSkriuwCoreError } from "./errors";

export type NativeResult = { ok: true; value?: unknown } | { ok: false; error: unknown };

export type SaveDocumentRequest = {
  noteId: string;
  /** `WorkspaceDocument.documentJson`, serialized. */
  documentJson: string;
  markdown: string;
  expectedRevision: number;
  at: number;
};

/** A secret to install, as `NoteLockSecretInput`; `kind` is `"pin"` or `"passphrase"`. */
export type NoteLockSecretArguments = {
  kind: string;
  secret: string;
  hint: string | null;
};

/**
 * The native surface. Every member returns a promise: the native side runs
 * each call on a background queue, so no call can block the JS thread
 * (docs/specs/mobile-app.md, R-P3).
 */
export type NativeSkriuwCore = {
  protocolVersion(): Promise<NativeResult>;
  open(slot: string): Promise<NativeResult>;
  bootstrap(): Promise<NativeResult>;
  submitOperations(operationsJson: string): Promise<NativeResult>;
  loadDocument(noteId: string): Promise<NativeResult>;
  saveDocument(request: SaveDocumentRequest): Promise<NativeResult>;
  noteLockState(): Promise<NativeResult>;
  configureNoteLock(secret: NoteLockSecretArguments): Promise<NativeResult>;
  unlockNoteLock(secret: string): Promise<NativeResult>;
  recoverNoteLock(
    recoveryCode: string,
    replacement: NoteLockSecretArguments,
  ): Promise<NativeResult>;
  changeNoteLockSecret(replacement: NoteLockSecretArguments): Promise<NativeResult>;
  relockNoteLock(): Promise<NativeResult>;
  readLockedDocuments(noteIds: string[] | null): Promise<NativeResult>;
  removeNoteLock(): Promise<NativeResult>;
  syncStatus(): Promise<NativeResult>;
  connectSync(token: string, baseUrl: string): Promise<NativeResult>;
  pauseSync(): Promise<NativeResult>;
  catchUpSync(): Promise<NativeResult>;
  backgroundRefreshSync(): Promise<NativeResult>;
  setSyncForeground(foreground: boolean): Promise<NativeResult>;
  setSyncOnline(online: boolean): Promise<NativeResult>;
  setWakeChannelConnected(connected: boolean): Promise<NativeResult>;
  notifyRemoteChange(): Promise<NativeResult>;
  noteLocalCommit(): Promise<NativeResult>;
  wakeChannelUrl(): Promise<NativeResult>;
  syncRecoveryView(): Promise<NativeResult>;
  retryBlockedSyncOperation(blockedId: string): Promise<NativeResult>;
  discardBlockedSyncOperation(blockedId: string): Promise<NativeResult>;
  adoptWorkspaceSlot(workspaceId: string): Promise<NativeResult>;
  activeWorkspaceSlot(): Promise<NativeResult>;
  shutdown(): Promise<NativeResult>;
  addListener(
    eventName: typeof SYNC_EVENT,
    listener: (event: NativeSyncEvent) => void,
  ): { remove(): void };
};

export const SYNC_EVENT = "onSyncEvent";

/** What the sync observer in `crates/skriuw-mobile` reports without being asked. */
export type NativeSyncEvent =
  | { kind: "status"; payload: string }
  | { kind: "workspaceChanged"; payload: string }
  | { kind: "sessionExpired"; payload: null };

export type SlotAdoptionKind = "claimed" | "active" | "switched";

/** Where the shell opens the workspace after routing an account (ADR-0046). */
export type WorkspaceRoute = {
  adoption: SlotAdoptionKind;
  /** The open handle is bound to the previous directory, so close and reopen. */
  reopenRequired: boolean;
};

export type OpenedWorkspace = {
  slot: string;
  /** For the recovery surface and diagnostics only. */
  databasePath: string;
};

export type SkriuwCore = {
  /** The workspace protocol version the native core speaks. */
  protocolVersion(): Promise<number>;
  /**
   * Opens, creating if absent, the workspace slot inside the platform's
   * application-support location. Opening the slot that is already open
   * returns it again, so a JS reload can re-attach.
   */
  open(slot?: string): Promise<OpenedWorkspace>;
  /** `WorkspaceSnapshot` JSON. Read once at startup; navigation never calls it. */
  bootstrap(): Promise<string>;
  /** `WorkspaceOperationEnvelope[]` JSON in, `OperationAck` JSON out. */
  submitOperations(operationsJson: string): Promise<string>;
  /** `WorkspaceDocument` JSON. */
  loadDocument(noteId: string): Promise<string>;
  /** `OperationAck` JSON. A stale revision fails with kind `conflict`. */
  saveDocument(request: SaveDocumentRequest): Promise<string>;
  /** `NoteLockState` JSON. */
  noteLockState(): Promise<string>;
  /** Installs the lock; resolves with the recovery code, shown once. */
  configureNoteLock(secret: NoteLockSecretArguments): Promise<string>;
  /** `NoteLockState` JSON. A wrong secret fails with kind `rejected` and the core's message. */
  unlockNoteLock(secret: string): Promise<string>;
  /** `NoteLockState` JSON. */
  recoverNoteLock(recoveryCode: string, replacement: NoteLockSecretArguments): Promise<string>;
  /** `NoteLockState` JSON. Needs an unlocked session. */
  changeNoteLockSecret(replacement: NoteLockSecretArguments): Promise<string>;
  /** `NoteLockState` JSON. */
  relockNoteLock(): Promise<string>;
  /** `WorkspaceDocument[]` JSON, every locked note when `noteIds` is null. */
  readLockedDocuments(noteIds: string[] | null): Promise<string>;
  /** `OperationAck` JSON. Needs an unlocked session. */
  removeNoteLock(): Promise<string>;
  /** `WorkspaceSyncStatus` JSON. Local only until `connectSync` succeeds. */
  syncStatus(): Promise<string>;
  /** Provisions this device and starts replication; `WorkspaceSyncStatus` JSON. */
  connectSync(token: string, baseUrl: string): Promise<string>;
  /** Stops replication and keeps everything local; `WorkspaceSyncStatus` JSON. */
  pauseSync(): Promise<string>;
  /** The resume path: clears retry delays and runs a cycle now. */
  catchUpSync(): Promise<string>;
  /** Best-effort cycle for a background task; `WorkspaceSyncStatus` JSON. */
  backgroundRefreshSync(): Promise<string>;
  setSyncForeground(foreground: boolean): Promise<void>;
  setSyncOnline(online: boolean): Promise<void>;
  setWakeChannelConnected(connected: boolean): Promise<void>;
  notifyRemoteChange(): Promise<void>;
  /** A local commit landed, so a push is due. A no-op while sync is off. */
  noteLocalCommit(): Promise<void>;
  /** The foreground wake channel URL, or `null` while nothing is connected. */
  wakeChannelUrl(): Promise<string | null>;
  /** `SyncRecoveryView` JSON. */
  syncRecoveryView(): Promise<string>;
  /** `SyncRecoveryView` JSON. */
  retryBlockedSyncOperation(blockedId: string): Promise<string>;
  /** `SyncRecoveryView` JSON. */
  discardBlockedSyncOperation(blockedId: string): Promise<string>;
  /** Routes the installation to the account's own storage. */
  adoptWorkspaceSlot(workspaceId: string): Promise<WorkspaceRoute>;
  /** Cloud workspace owning the open store, or `null` while unclaimed. */
  activeWorkspaceSlot(): Promise<string | null>;
  /** Returns an unsubscribe. */
  subscribeSync(listener: (event: NativeSyncEvent) => void): () => void;
  /** Drains the owner thread. Safe to call when nothing is open. */
  shutdown(): Promise<void>;
};

export const DEFAULT_SLOT = "default";

const SLOT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isNativeResult(value: unknown): value is NativeResult {
  return (
    typeof value === "object" && value !== null && typeof (value as NativeResult).ok === "boolean"
  );
}

async function settle(call: Promise<NativeResult>): Promise<unknown> {
  let result: unknown;
  try {
    result = await call;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new SkriuwCoreError({ kind: "internal", message }, { cause });
  }

  if (!isNativeResult(result)) {
    throw new SkriuwCoreError({
      kind: "internal",
      message: "native core answered with a malformed result",
    });
  }
  if (!result.ok) {
    throw toSkriuwCoreError(result.error);
  }
  return result.value;
}

async function settleNothing(call: Promise<NativeResult>): Promise<void> {
  await settle(call);
}

async function settleOptionalText(call: Promise<NativeResult>): Promise<string | null> {
  const value = await settle(call);
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SkriuwCoreError({
      kind: "internal",
      message: "native core answered without a text value",
    });
  }
  return value;
}

const ADOPTIONS: readonly SlotAdoptionKind[] = ["claimed", "active", "switched"];

function parseRoute(json: string): WorkspaceRoute {
  let parsed: { adoption?: unknown; reopenRequired?: unknown };
  try {
    parsed = JSON.parse(json) as { adoption?: unknown; reopenRequired?: unknown };
  } catch (cause) {
    throw new SkriuwCoreError(
      {
        kind: "invalid-payload",
        message: "native core answered the slot route with malformed JSON",
      },
      { cause },
    );
  }
  const adoption = ADOPTIONS.find((kind) => kind === parsed.adoption);
  if (adoption === undefined) {
    throw new SkriuwCoreError({
      kind: "invalid-payload",
      message: "native core answered the slot route without an adoption",
    });
  }
  return { adoption, reopenRequired: parsed.reopenRequired === true };
}

async function settleText(call: Promise<NativeResult>): Promise<string> {
  const value = await settle(call);
  if (typeof value !== "string") {
    throw new SkriuwCoreError({
      kind: "internal",
      message: "native core answered without a JSON payload",
    });
  }
  return value;
}

/** Binds the typed surface to a native implementation; tests pass a fake. */
export function createSkriuwCore(native: NativeSkriuwCore): SkriuwCore {
  return {
    async protocolVersion() {
      const value = await settle(native.protocolVersion());
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new SkriuwCoreError({
          kind: "internal",
          message: "native core answered without a protocol version",
        });
      }
      return value;
    },

    async open(slot = DEFAULT_SLOT) {
      if (!SLOT_PATTERN.test(slot)) {
        throw new SkriuwCoreError({
          kind: "invalid-slot",
          message: `workspace slot must match ${SLOT_PATTERN.source}`,
        });
      }
      return { slot, databasePath: await settleText(native.open(slot)) };
    },

    bootstrap() {
      return settleText(native.bootstrap());
    },

    submitOperations(operationsJson) {
      return settleText(native.submitOperations(operationsJson));
    },

    loadDocument(noteId) {
      return settleText(native.loadDocument(noteId));
    },

    saveDocument(request) {
      return settleText(native.saveDocument(request));
    },

    noteLockState() {
      return settleText(native.noteLockState());
    },

    configureNoteLock(secret) {
      return settleText(native.configureNoteLock(secret));
    },

    unlockNoteLock(secret) {
      return settleText(native.unlockNoteLock(secret));
    },

    recoverNoteLock(recoveryCode, replacement) {
      return settleText(native.recoverNoteLock(recoveryCode, replacement));
    },

    changeNoteLockSecret(replacement) {
      return settleText(native.changeNoteLockSecret(replacement));
    },

    relockNoteLock() {
      return settleText(native.relockNoteLock());
    },

    readLockedDocuments(noteIds) {
      return settleText(native.readLockedDocuments(noteIds));
    },

    removeNoteLock() {
      return settleText(native.removeNoteLock());
    },

    syncStatus: () => settleText(native.syncStatus()),

    connectSync: (token, baseUrl) => settleText(native.connectSync(token, baseUrl)),

    pauseSync: () => settleText(native.pauseSync()),

    catchUpSync: () => settleText(native.catchUpSync()),

    backgroundRefreshSync: () => settleText(native.backgroundRefreshSync()),

    setSyncForeground: (foreground) => settleNothing(native.setSyncForeground(foreground)),

    setSyncOnline: (online) => settleNothing(native.setSyncOnline(online)),

    setWakeChannelConnected: (connected) =>
      settleNothing(native.setWakeChannelConnected(connected)),

    notifyRemoteChange: () => settleNothing(native.notifyRemoteChange()),

    noteLocalCommit: () => settleNothing(native.noteLocalCommit()),

    wakeChannelUrl: () => settleOptionalText(native.wakeChannelUrl()),

    syncRecoveryView: () => settleText(native.syncRecoveryView()),

    retryBlockedSyncOperation: (blockedId) =>
      settleText(native.retryBlockedSyncOperation(blockedId)),

    discardBlockedSyncOperation: (blockedId) =>
      settleText(native.discardBlockedSyncOperation(blockedId)),

    async adoptWorkspaceSlot(workspaceId) {
      return parseRoute(await settleText(native.adoptWorkspaceSlot(workspaceId)));
    },

    activeWorkspaceSlot: () => settleOptionalText(native.activeWorkspaceSlot()),

    subscribeSync(listener) {
      const subscription = native.addListener(SYNC_EVENT, listener);
      return () => subscription.remove();
    },

    async shutdown() {
      await settle(native.shutdown());
    },
  };
}
