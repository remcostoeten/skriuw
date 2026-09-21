import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import {
  WORKSPACE_PROTOCOL_VERSION,
  type WorkspaceOperationEnvelope,
  type WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import type { SkriuwCore } from "../../modules/skriuw-core/src/core";
import { SkriuwCoreError, type SkriuwCoreErrorKind } from "../../modules/skriuw-core/src/errors";

export type FakeCoreCall =
  | "protocolVersion"
  | "open"
  | "bootstrap"
  | "submitOperations"
  | "loadDocument"
  | "saveDocument"
  | "shutdown";

export type FakeCoreOptions = {
  snapshot?: WorkspaceSnapshot;
  protocolVersion?: number;
};

export type FakeSkriuwCore = SkriuwCore & {
  /** Every native call in order: the navigation trace asserts on this. */
  calls: FakeCoreCall[];
  /** The next `open` rejects with this kind, once. */
  failNextOpen: (kind: SkriuwCoreErrorKind, message: string) => void;
  /** The next `submitOperations` rejects with this kind, once, writing nothing. */
  failNextSubmit: (kind: SkriuwCoreErrorKind, message: string) => void;
};

function failureKind(message: string): SkriuwCoreErrorKind {
  if (message.startsWith("Revision conflict")) return "conflict";
  if (message.startsWith("Unsupported workspace protocol")) return "unsupported-protocol";
  if (message.includes("does not exist")) return "not-found";
  return "rejected";
}

/**
 * `skriuw-core` without a device: the JSON surface of the native module over
 * the in-memory bridge, with the native failure kinds. The durable state
 * outlives `shutdown`, so a test can close and reopen like an app relaunch.
 */
export function createFakeSkriuwCore(options: FakeCoreOptions = {}): FakeSkriuwCore {
  const durable = createMemoryBridge({ snapshot: options.snapshot });
  const calls: FakeCoreCall[] = [];
  let open = false;
  let pendingOpenFailure: SkriuwCoreError | null = null;
  let pendingSubmitFailure: SkriuwCoreError | null = null;

  function requireOpen(): void {
    if (!open) {
      throw new SkriuwCoreError({ kind: "closed", message: "no workspace is open" });
    }
  }

  async function submit(operationsJson: string): Promise<string> {
    requireOpen();
    if (pendingSubmitFailure !== null) {
      const failure = pendingSubmitFailure;
      pendingSubmitFailure = null;
      throw failure;
    }
    const envelopes = JSON.parse(operationsJson) as WorkspaceOperationEnvelope[];
    try {
      return JSON.stringify(await durable.applyWorkspaceOperations(envelopes));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new SkriuwCoreError({ kind: failureKind(message), message }, { cause });
    }
  }

  return {
    calls,

    failNextOpen(kind, message) {
      pendingOpenFailure = new SkriuwCoreError({ kind, message });
    },

    failNextSubmit(kind, message) {
      pendingSubmitFailure = new SkriuwCoreError({ kind, message });
    },

    async protocolVersion() {
      calls.push("protocolVersion");
      return options.protocolVersion ?? WORKSPACE_PROTOCOL_VERSION;
    },

    async open(slot = "default") {
      calls.push("open");
      if (pendingOpenFailure !== null) {
        const failure = pendingOpenFailure;
        pendingOpenFailure = null;
        throw failure;
      }
      open = true;
      return { slot, databasePath: `memory://${slot}/workspace.sqlite` };
    },

    async bootstrap() {
      calls.push("bootstrap");
      requireOpen();
      return JSON.stringify(await durable.bootstrapWorkspace());
    },

    submitOperations(operationsJson) {
      calls.push("submitOperations");
      return submit(operationsJson);
    },

    async loadDocument(noteId) {
      calls.push("loadDocument");
      requireOpen();
      const document = (await durable.readWorkspaceDelta([noteId])).documents[0];
      if (!document) {
        throw new SkriuwCoreError({ kind: "not-found", message: `no document ${noteId}`, id: noteId });
      }
      return JSON.stringify(document);
    },

    saveDocument(request) {
      calls.push("saveDocument");
      return submit(
        JSON.stringify([
          {
            protocolVersion: WORKSPACE_PROTOCOL_VERSION,
            operation: {
              type: "save_document",
              noteId: request.noteId,
              documentJson: JSON.parse(request.documentJson),
              markdown: request.markdown,
              wordCount: request.markdown.split(/\s+/).filter(Boolean).length,
              expectedRevision: request.expectedRevision,
              at: request.at,
            },
          } satisfies WorkspaceOperationEnvelope,
        ]),
      );
    },

    async shutdown() {
      calls.push("shutdown");
      open = false;
    },
  };
}
