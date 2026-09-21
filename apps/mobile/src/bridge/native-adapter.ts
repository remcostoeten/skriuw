import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import {
  WORKSPACE_PROTOCOL_VERSION,
  type NoteLockState,
  type OperationAck,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import { DEFAULT_SLOT, type OpenedWorkspace, type SkriuwCore } from "../../modules/skriuw-core/src/core";
import { SkriuwCoreError } from "../../modules/skriuw-core/src/errors";
import { refuseMissingNativeCommand } from "./refusals";

export type NativeBridgeOptions = {
  slot?: string;
};

export type NativeBridge = BridgePort & {
  /**
   * Drains the native owner thread once any open and any command already in
   * flight has settled, so nothing is left open behind a resolved close and no
   * command is answered `closed` halfway through. The next command
   * reopens the slot, and one issued while the drain is in flight waits for it
   * instead of re-attaching to the workspace being closed.
   */
  close: () => Promise<void>;
};

const UNCONFIGURED_NOTE_LOCK: NoteLockState = {
  configured: false,
  unlocked: false,
  kind: null,
  hint: null,
  failedAttempts: 0,
  nextAttemptAt: null,
  lockedNoteCount: 0,
};

function ignoreOutcome(): void {
  return undefined;
}

function parsePayload<T>(json: string, command: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (cause) {
    throw new SkriuwCoreError(
      { kind: "invalid-payload", message: `native core answered ${command} with malformed JSON` },
      { cause },
    );
  }
}

/**
 * The command surface over the `skriuw-core` native module. The slot is opened
 * and its protocol version checked once; a failed open is forgotten so the
 * startup failure flow can retry. `bootstrapWorkspace` reads native SQLite and
 * is for startup and for the rollback after a rejected batch only: navigation
 * runs on the hydrated store and never reaches this adapter.
 *
 * `skriuw-core` exposes bootstrap, operations and documents. Search, the note
 * lock, media, sync and workspace slots refuse until the native module carries
 * them; nothing here keeps a second copy of durable state in TypeScript.
 * Sidebar expansion has no native home either, so it lasts for the process
 * only: a relaunch reads `null` and the tree falls back to its defaults.
 */
export function createNativeBridge(core: SkriuwCore, options: NativeBridgeOptions = {}): NativeBridge {
  const slot = options.slot ?? DEFAULT_SLOT;
  let opening: Promise<OpenedWorkspace> | null = null;
  let closing: Promise<void> | null = null;
  let expandedFolderIds: string[] | null = null;
  const inFlight = new Set<Promise<unknown>>();

  async function openSlot(): Promise<OpenedWorkspace> {
    if (closing !== null) {
      await closing;
    }
    const version = await core.protocolVersion();
    if (version !== WORKSPACE_PROTOCOL_VERSION) {
      throw new SkriuwCoreError({
        kind: "unsupported-protocol",
        message: `The native core speaks workspace protocol ${version}; this build expects ${WORKSPACE_PROTOCOL_VERSION}. Update Skriuw.`,
        version,
      });
    }
    return core.open(slot);
  }

  function ensureOpen(): Promise<OpenedWorkspace> {
    if (opening === null) {
      const attempt = openSlot();
      opening = attempt;
      attempt.catch(() => {
        if (opening === attempt) {
          opening = null;
        }
      });
    }
    return opening;
  }

  async function whenOpen<T>(command: () => Promise<T>): Promise<T> {
    await ensureOpen();
    const running = command();
    inFlight.add(running);
    try {
      return await running;
    } finally {
      inFlight.delete(running);
    }
  }

  async function loadDocument(noteId: string): Promise<WorkspaceDocument | null> {
    try {
      return parsePayload<WorkspaceDocument>(await core.loadDocument(noteId), "loadDocument");
    } catch (error) {
      if (error instanceof SkriuwCoreError && error.kind === "not-found") {
        return null;
      }
      throw error;
    }
  }

  return {
    bootstrapWorkspace: () =>
      whenOpen(async () => parsePayload<WorkspaceSnapshot>(await core.bootstrap(), "bootstrap")),

    readWorkspaceDelta: (ids) =>
      whenOpen(async () => {
        const loaded = await Promise.all(ids.map((id) => loadDocument(id)));
        return { documents: loaded.filter((document) => document !== null), nodes: [] };
      }),

    applyWorkspaceOperations: (operations) =>
      whenOpen(async () =>
        parsePayload<OperationAck>(
          await core.submitOperations(JSON.stringify(operations)),
          "submitOperations",
        ),
      ),

    loadSidebarExpansion: async () => (expandedFolderIds === null ? null : [...expandedFolderIds]),

    saveSidebarExpansion: async (folderIds) => {
      expandedFolderIds = [...folderIds];
    },

    searchWorkspace: async () => refuseMissingNativeCommand("Search"),
    searchIndexStatus: async () => refuseMissingNativeCommand("The search index"),
    rebuildSearchIndex: async () => refuseMissingNativeCommand("Rebuilding the search index"),

    noteLockState: async () => UNCONFIGURED_NOTE_LOCK,
    configureNoteLock: async () => refuseMissingNativeCommand("Locking notes"),
    unlockNoteLock: async () => refuseMissingNativeCommand("Unlocking notes"),
    recoverNoteLock: async () => refuseMissingNativeCommand("Recovering the note lock"),
    changeNoteLockSecret: async () => refuseMissingNativeCommand("Changing the note lock"),
    relockNoteLock: async () => UNCONFIGURED_NOTE_LOCK,
    removeNoteLock: async () => refuseMissingNativeCommand("Removing the note lock"),
    readLockedDocuments: async () => refuseMissingNativeCommand("Reading locked notes"),

    storeNoteImage: async () => refuseMissingNativeCommand("Storing media"),
    readNoteImageBlob: async () => refuseMissingNativeCommand("Reading stored media"),

    workspaceSyncStatus: async () => ({ state: "localOnly" }),
    connectWorkspaceSync: async () => refuseMissingNativeCommand("Sync"),
    pauseWorkspaceSync: async () => ({ state: "localOnly" }),
    retryWorkspaceSync: async () => refuseMissingNativeCommand("Sync"),
    refreshWorkspaceSync: async () => refuseMissingNativeCommand("Sync"),
    setWorkspaceSyncOnline: async () => undefined,
    setWorkspaceSyncVisibility: async () => undefined,
    listBlockedSyncOperations: async () => ({ viewVersion: 1, blocked: [], discarded: [] }),
    retryBlockedSyncOperation: async (blockedId) => {
      throw new Error(`No blocked sync operation ${blockedId}.`);
    },
    discardBlockedSyncOperation: async (blockedId) => {
      throw new Error(`No blocked sync operation ${blockedId}.`);
    },

    adoptWorkspaceSlot: async () => refuseMissingNativeCommand("Per-account workspaces"),
    activeWorkspaceSlot: async () => (slot === DEFAULT_SLOT ? null : slot),

    close: () => {
      const pendingOpen = opening;
      const previousClose = closing;
      opening = null;
      async function drain(): Promise<void> {
        await previousClose;
        if (pendingOpen !== null) {
          await pendingOpen.then(ignoreOutcome, ignoreOutcome);
        }
        await Promise.allSettled(inFlight);
        await core.shutdown();
      }
      function release(): void {
        if (closing === released) {
          closing = null;
        }
      }
      const shutdown = drain();
      const released = shutdown.then(release, release);
      closing = released;
      return shutdown;
    },
  };
}
