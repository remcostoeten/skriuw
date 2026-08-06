import type { BlockedSyncOperation } from "../../bridge/commands";

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
  set_note_cover_full_width: "Change note cover layout",
  set_note_cover_transform: "Adjust note cover",
  move_node: "Move",
  set_node_pinned: "Pin or unpin",
  save_document: "Edit note",
  trash_subtree: "Move to trash",
  restore_subtree: "Restore from trash",
  purge_subtree: "Delete permanently",
  attach_image: "Attach image",
  set_note_property: "Change note property",
  remove_note_property: "Remove note property",
  reorder_note_properties: "Reorder note properties",
  set_note_property_template: "Change property template",
  delete_note_property_template: "Delete property template",
  reorder_note_property_templates: "Reorder property templates",
};

/** Human label for one blocked change: the action plus the note it touches. */
export function blockedItemLabel(
  item: Pick<BlockedSyncOperation, "operationType" | "targetTitle" | "targetId">,
): string {
  const operation =
    OPERATION_LABELS[item.operationType] ?? item.operationType.replaceAll("_", " ");
  if (item.targetTitle) return `${operation} · ${item.targetTitle}`;
  if (item.targetId) return `${operation} · ${item.targetId}`;
  return operation;
}

/** Human explanation of why one queued change cannot upload. */
export function blockedCauseText(reasonCode: string): string {
  switch (reasonCode) {
    case "asset_content_missing":
      return "The image bytes behind this change are not on this device yet. They upload automatically once the image arrives, or you can retry now.";
    case "operation_too_large":
      return "This change is too large for the current sync protocol, so it can only be discarded.";
    case "unsupported_operation":
      return "This change is not supported by the current sync protocol, so it can only be discarded.";
    default:
      return "The server rejected this change.";
  }
}

/** Whether retrying can ever succeed for this cause. */
export function blockedItemRetryable(reasonCode: string): boolean {
  return reasonCode !== "operation_too_large" && reasonCode !== "unsupported_operation";
}

/** Human explanation of a whole-queue blocked sync state. */
export function blockedStateText(reason: string): string {
  switch (reason) {
    case "authorization_denied":
      return "The cloud denied this workspace access. Check the blocked changes below, then retry sync.";
    case "push_conflict":
      return "The cloud saw a conflicting upload from another device. Retry sync to reconcile.";
    case "protocol_mismatch":
      return "This app version and the cloud speak different sync protocols. Update Skriuw, then retry sync.";
    case "rejected_acknowledgement":
      return "The cloud rejected the last upload receipt. Retry sync; blocked changes are listed below.";
    case "rejected_checkpoint":
      return "The cloud rejected the workspace checkpoint. Retry sync; blocked changes are listed below.";
    case "storage_failure":
      return "The local sync queue hit a storage failure. Retry sync; if this persists, check the Data section.";
    default:
      return "Sync stopped because the server rejected a local change. Blocked changes are listed below.";
  }
}
