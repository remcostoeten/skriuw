import type { NoteProperty, WorkspaceOperation } from "../contracts/workspace";
import type {
  MarkdownImportPlan,
  MarkdownReferenceTarget,
} from "../export/markdown-transfer-model";
import { planMarkdownImport } from "../export/markdown-transfer-model";
import type { ImportBundle, ImportedNoteProperty } from "./model";

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function toNoteProperty(
  imported: ImportedNoteProperty,
  noteId: string,
  position: number,
  makeId: () => string,
): NoteProperty {
  const base = {
    id: makeId(),
    noteId,
    name: imported.name,
    position,
  };
  if (imported.value.type === "list") {
    const options = imported.value.values.map((label) => ({
      id: makeId(),
      label,
      color: "gray" as const,
    }));
    return {
      ...base,
      value: {
        valueVersion: 1,
        type: "multi-select",
        value: options.map((option) => option.id),
      },
      options,
    };
  }
  return {
    ...base,
    value: { valueVersion: 1, ...imported.value },
    options: [],
  };
}

function buildPropertyOperations(
  properties: readonly ImportedNoteProperty[],
  noteId: string,
  at: number,
  makeId: () => string,
): WorkspaceOperation[] {
  return properties.map((imported, position) => ({
    type: "set_note_property",
    property: toNoteProperty(imported, noteId, position, makeId),
    at,
  }));
}

/**
 * Runs the safety-aware markdown planner over an adapter bundle, then restores
 * the adapter's explicit note titles, which the planner derives from filenames,
 * and appends `set_note_property` operations for adapter-supplied properties.
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
  const noteByPath = new Map(
    bundle.notes.map((note) => [normalizeTreePath(note.relativePath), note]),
  );
  const idToPath = new Map(plan.notes.map((note) => [note.id, note.relativePath]));
  const propertyOperations: WorkspaceOperation[] = [];
  for (const operation of plan.operations) {
    if (operation.type !== "create_note") {
      continue;
    }
    const path = idToPath.get(operation.id);
    const note = path === undefined ? undefined : noteByPath.get(path);
    if (!note) {
      continue;
    }
    operation.title = note.title;
    if (note.properties && note.properties.length > 0) {
      propertyOperations.push(
        ...buildPropertyOperations(note.properties, operation.id, at, makeId),
      );
    }
  }
  plan.operations.push(...propertyOperations);
  return plan;
}
