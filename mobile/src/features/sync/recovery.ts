import type { MobileSyncPort, SyncRecoveryView } from "./port";

/**
 * The recovery surface: the changes sync refused, and what can be done with
 * each (R-Q1).
 *
 * A change that cannot upload must stay visible and actionable rather than
 * disappearing into a log. Two things follow from that. Discarding is
 * destructive and irreversible, so it is confirmed rather than offered as a
 * one-tap escape from an error row. And a retry that cannot possibly succeed
 * is not offered at all: an operation the protocol will never carry is a
 * discard decision, and pretending otherwise turns a clear dead end into a
 * loop the user taps through.
 */

export type BlockedRow = {
  blockedId: string;
  /** The action plus what it touched, e.g. "Edit note · Groceries". */
  label: string;
  cause: string;
  retryable: boolean;
  blockedAt: number;
};

export type DiscardedRow = {
  blockedId: string;
  label: string;
  discardedAt: number;
};

export type RecoveryView =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | {
      kind: "loaded";
      blocked: BlockedRow[];
      discarded: DiscardedRow[];
      /** The row an action is in flight for, so the screen can disable it. */
      busyId: string | null;
      /** Names the row whose confirmation is open, or `null`. */
      confirmingDiscardId: string | null;
    };

export type RecoverySurface = {
  view: () => RecoveryView;
  refresh: () => Promise<void>;
  retry: (blockedId: string) => Promise<void>;
  askToDiscard: (blockedId: string) => void;
  cancelDiscard: () => void;
  confirmDiscard: (blockedId: string) => Promise<void>;
};

export type RecoverySurfaceOptions = {
  port: Pick<
    MobileSyncPort,
    "listBlockedSyncOperations" | "retryBlockedSyncOperation" | "discardBlockedSyncOperation"
  >;
  onChange: (view: RecoveryView) => void;
  reportError?: (error: unknown) => void;
};

const OPERATION_LABELS: Record<string, string> = {
  create_tag: "Create tag",
  rename_tag: "Rename tag",
  recolor_tag: "Recolor tag",
  delete_tag: "Delete tag",
  create_person: "Create person",
  rename_person: "Rename person",
  recolor_person: "Recolor person",
  delete_person: "Delete person",
  create_folder: "Create folder",
  create_note: "Create note",
  rename_node: "Rename",
  set_note_cover: "Change note cover",
  set_note_cover_gradient: "Change note cover gradient",
  set_note_cover_full_width: "Change note cover layout",
  set_note_cover_transform: "Adjust note cover",
  move_node: "Move",
  set_node_pinned: "Pin or unpin",
  save_document: "Edit note",
  trash_subtree: "Move to trash",
  restore_subtree: "Restore from trash",
  purge_subtree: "Delete permanently",
  attach_image: "Attach image",
  set_media_metadata: "Rename media",
  set_note_property: "Change note property",
  remove_note_property: "Remove note property",
  reorder_note_properties: "Reorder note properties",
  set_note_property_template: "Change property template",
  delete_note_property_template: "Delete property template",
  reorder_note_property_templates: "Reorder property templates",
};

/** Causes no retry can clear, so only discarding is offered. */
const TERMINAL_CAUSES = new Set(["operation_too_large", "unsupported_operation"]);

export const DISCARD_CONFIRMATION =
  "This change is removed from this device and never reaches your other devices. It cannot be undone.";

/** The action plus what it touched, for one blocked or discarded change. */
export function blockedLabel(item: {
  operationType: string;
  targetTitle: string | null;
  targetId: string | null;
}): string {
  const operation =
    OPERATION_LABELS[item.operationType] ?? item.operationType.replaceAll("_", " ");
  if (item.targetTitle !== null && item.targetTitle.length > 0) {
    return `${operation} · ${item.targetTitle}`;
  }
  if (item.targetId !== null && item.targetId.length > 0) {
    return `${operation} · ${item.targetId}`;
  }
  return operation;
}

/** Why one queued change cannot upload. */
export function blockedCause(reasonCode: string): string {
  switch (reasonCode) {
    case "asset_content_missing":
      return "The image behind this change is not on this device yet. It uploads on its own once the image arrives.";
    case "operation_too_large":
      return "This change is larger than sync can carry, so it can only be discarded.";
    case "unsupported_operation":
      return "This app version's cloud cannot carry this change, so it can only be discarded.";
    case "cloud_rejected":
      return "The cloud refused this change.";
    default:
      return "The cloud refused this change.";
  }
}

export function blockedRetryable(reasonCode: string): boolean {
  return !TERMINAL_CAUSES.has(reasonCode);
}

export function createRecoverySurface(options: RecoverySurfaceOptions): RecoverySurface {
  let view: RecoveryView = { kind: "loading" };
  let busyId: string | null = null;
  let confirmingDiscardId: string | null = null;

  function publish(next: RecoveryView): void {
    view = next;
    options.onChange(view);
  }

  function present(payload: SyncRecoveryView): void {
    publish({
      kind: "loaded",
      blocked: payload.blocked.map((item) => ({
        blockedId: item.blockedId,
        label: blockedLabel(item),
        cause: blockedCause(item.reasonCode),
        retryable: blockedRetryable(item.reasonCode),
        blockedAt: item.firstBlockedAt,
      })),
      discarded: payload.discarded.map((item) => ({
        blockedId: item.blockedId,
        label: blockedLabel(item),
        discardedAt: item.discardedAt,
      })),
      busyId,
      confirmingDiscardId,
    });
  }

  function fail(error: unknown): void {
    options.reportError?.(error);
    busyId = null;
    confirmingDiscardId = null;
    publish({
      kind: "failed",
      message:
        error instanceof Error
          ? `The blocked changes could not be read: ${error.message}`
          : "The blocked changes could not be read.",
    });
  }

  async function act(
    blockedId: string,
    run: (blockedId: string) => Promise<SyncRecoveryView>,
  ): Promise<void> {
    if (busyId !== null) return;
    busyId = blockedId;
    if (view.kind === "loaded") {
      publish({ ...view, busyId, confirmingDiscardId });
    }
    try {
      const payload = await run(blockedId);
      busyId = null;
      confirmingDiscardId = null;
      present(payload);
    } catch (error) {
      fail(error);
    }
  }

  return {
    view: () => view,

    async refresh() {
      try {
        present(await options.port.listBlockedSyncOperations());
      } catch (error) {
        fail(error);
      }
    },

    retry: (blockedId) => act(blockedId, options.port.retryBlockedSyncOperation),

    askToDiscard(blockedId) {
      if (view.kind !== "loaded" || busyId !== null) return;
      confirmingDiscardId = blockedId;
      publish({ ...view, confirmingDiscardId });
    },

    cancelDiscard() {
      if (view.kind !== "loaded") return;
      confirmingDiscardId = null;
      publish({ ...view, confirmingDiscardId });
    },

    async confirmDiscard(blockedId) {
      if (confirmingDiscardId !== blockedId) return;
      await act(blockedId, options.port.discardBlockedSyncOperation);
    },
  };
}
