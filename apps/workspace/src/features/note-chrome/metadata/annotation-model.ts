import type { WorkspaceAnnotation } from "@skriuw/renderer-core/contracts/workspace";

/**
 * A thread is orphaned when its anchor is gone from the note. Detection runs
 * against the saved Markdown rather than the rendered document: the editor
 * shows at most a 192-block window, so a thread anchored outside it would
 * otherwise be reported as orphaned every time.
 */
export function anchoredThreadIds(markdown: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const pattern = /data-skriuw-annotation=["']([A-Za-z0-9_-]+)["']/g;
  let match = pattern.exec(markdown);
  while (match !== null) {
    if (match[1]) ids.add(match[1]);
    match = pattern.exec(markdown);
  }
  return ids;
}

export function threadsForNote(
  annotations: ReadonlyMap<string, WorkspaceAnnotation>,
  noteId: string,
): WorkspaceAnnotation[] {
  return [...annotations.values()]
    .filter((annotation) => annotation.noteId === noteId)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}
