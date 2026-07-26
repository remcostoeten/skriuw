import type {
  MarkdownImportPlan,
  MarkdownReferenceTarget,
} from "../export/markdown-transfer-model";
import { planMarkdownImport } from "../export/markdown-transfer-model";
import type { ImportBundle } from "./model";

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Runs the safety-aware markdown planner over an adapter bundle, then restores
 * the adapter's explicit note titles, which the planner derives from filenames.
 */
export function planImportBundle(
  bundle: ImportBundle,
  at: number,
  makeId: () => string,
  existingNotes: readonly MarkdownReferenceTarget[] = [],
): MarkdownImportPlan {
  const plan = planMarkdownImport(
    {
      directories: bundle.directories,
      files: bundle.notes.map((note) => ({
        relativePath: note.relativePath,
        content: note.markdown,
      })),
      skipped: 0,
    },
    at,
    makeId,
    existingNotes,
  );
  const titleByPath = new Map(
    bundle.notes.map((note) => [normalizeTreePath(note.relativePath), note.title]),
  );
  const idToPath = new Map(plan.notes.map((note) => [note.id, note.relativePath]));
  for (const operation of plan.operations) {
    if (operation.type !== "create_note") {
      continue;
    }
    const path = idToPath.get(operation.id);
    const title = path === undefined ? undefined : titleByPath.get(path);
    if (title !== undefined) {
      operation.title = title;
    }
  }
  return plan;
}
