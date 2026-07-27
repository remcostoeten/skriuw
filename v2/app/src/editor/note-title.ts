import type { Node as ProseMirrorNode } from "prosemirror-model";

export const TITLE_MAX_LENGTH = 120;
export const STARTER_TITLE = "Untitled";

/**
 * The single rule for turning a note's leading text into its node title.
 * Anything that writes a note title has to go through here, otherwise the
 * stored title drifts from the one the editor derives on its next save.
 */
export function boundTitle(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed.slice(0, TITLE_MAX_LENGTH) : STARTER_TITLE;
}

export function deriveTitle(document: ProseMirrorNode): string {
  return boundTitle(document.firstChild?.textContent ?? "");
}
