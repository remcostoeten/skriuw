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
  shutdown(): Promise<NativeResult>;
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

    async shutdown() {
      await settle(native.shutdown());
    },
  };
}
