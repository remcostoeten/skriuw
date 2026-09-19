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
  /** Drains the owner thread. Safe to call when nothing is open. */
  shutdown(): Promise<void>;
};

export const DEFAULT_SLOT = "default";

const SLOT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isNativeResult(value: unknown): value is NativeResult {
  return typeof value === "object" && value !== null && typeof (value as NativeResult).ok === "boolean";
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

    async shutdown() {
      await settle(native.shutdown());
    },
  };
}
