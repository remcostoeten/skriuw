import type { DocumentConflict } from "@/bridge/commands";

/**
 * Why the two devices ended up holding different content. The cause decides
 * whether the user is choosing between versions or acknowledging a change that
 * could not land at all.
 */
export function conflictCauseText(item: DocumentConflict): string {
  switch (item.subreason ?? item.reasonCode) {
    case "concurrent_document_version":
      return "This note was edited on two devices before they caught up with each other. Both versions were kept.";
    case "tombstone_blocked":
      return "The edit arrived after this note was deleted somewhere else, so it was never applied.";
    case "concurrent_field_edit":
      return "The same field was changed on two devices at once.";
    case "collection_conflict":
      return "The same list was reordered on two devices at once.";
    case "tree_conflict":
      return "This note was moved or deleted on one device while it changed on another.";
    case "content_unavailable":
      return "The content behind this change never reached this device.";
    case "missing_dependency":
      return "This change depends on something this device does not have.";
    case "identity_conflict":
      return "Two devices created different things under the same identity.";
    default:
      return "Two devices disagreed about this note. Both versions were kept.";
  }
}

/** What happened to a divergence that is no longer open. */
export function conflictOutcomeText(item: DocumentConflict): string {
  switch (item.resolvedChoice) {
    case "local":
      return "You kept this device's version.";
    case "remote":
      return "You kept the version from the other device.";
    case "merged":
      return "You saved a merged version.";
    case "superseded":
      return "Settled from another device before you chose. Both versions are still recorded.";
    default:
      return "Settled.";
  }
}

/**
 * A single-line preview of one version, so the list can show what differs
 * before the user opens the full comparison.
 */
export function versionPreview(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  if (!line) return "Empty note";
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}
