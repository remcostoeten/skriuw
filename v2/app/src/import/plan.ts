import type { NoteProperty, WorkspaceOperation } from "../contracts/workspace";
import { hasLosslessMarkdownDocument } from "../editor/schema";
import type {
  MarkdownImportPlan,
  MarkdownReferenceTarget,
} from "../export/markdown-transfer-model";
import { planMarkdownImport } from "../export/markdown-transfer-model";
import type { ImportBundle, ImportedNoteProperty } from "./model";

export type ImportTagTarget = {
  id: string;
  name: string;
};

export type ImportBundlePlan = MarkdownImportPlan & {
  createdTags: number;
  tagSkippedNotes: number;
  tagPropertyNotes: number;
};

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function importedTime(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
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
  startPosition = 0,
): WorkspaceOperation[] {
  return properties.map((imported, position) => ({
    type: "set_note_property",
    property: toNoteProperty(
      imported,
      noteId,
      startPosition + position,
      makeId,
    ),
    at,
  }));
}

type TagResolution = {
  idByName: Map<string, string>;
  operations: WorkspaceOperation[];
};

function resolveImportedTags(
  bundle: ImportBundle,
  existingTags: readonly ImportTagTarget[],
  at: number,
  makeId: () => string,
): TagResolution {
  const existingByLowerName = new Map(
    existingTags.map((tag) => [tag.name.trim().toLowerCase(), tag.id]),
  );
  const idByName = new Map<string, string>();
  const operations: WorkspaceOperation[] = [];
  for (const note of bundle.notes) {
    for (const raw of note.tags ?? []) {
      const name = raw.trim();
      if (name.length === 0 || idByName.has(name.toLowerCase())) {
        continue;
      }
      const existingId = existingByLowerName.get(name.toLowerCase());
      if (existingId !== undefined) {
        idByName.set(name.toLowerCase(), existingId);
        continue;
      }
      const id = makeId();
      idByName.set(name.toLowerCase(), id);
      operations.push({
        type: "create_tag",
        tag: { id, name, color: null, createdAt: at, updatedAt: at, createdIn: null },
      });
    }
  }
  return { idByName, operations };
}

/**
 * The paragraph of chips is the association mechanism: the store derives
 * note→tag references from `tag_ref` nodes in the saved document.
 */
function appendTagChips(
  documentJson: unknown,
  markdown: string,
  tags: readonly string[],
  idByName: ReadonlyMap<string, string>,
): { documentJson: unknown; markdown: string } | null {
  const document = documentJson as { type?: unknown; content?: unknown[] };
  if (document.type !== "doc" || !Array.isArray(document.content)) {
    return null;
  }
  const chips: unknown[] = [];
  const labels: string[] = [];
  for (const raw of tags) {
    const name = raw.trim();
    const id = idByName.get(name.toLowerCase());
    if (id === undefined) {
      continue;
    }
    if (chips.length > 0) {
      chips.push({ type: "text", text: " " });
    }
    chips.push({ type: "tag_ref", attrs: { id, label: name } });
    labels.push(`#${name}`);
  }
  if (chips.length === 0) {
    return null;
  }
  return {
    documentJson: {
      ...document,
      content: [...document.content, { type: "paragraph", content: chips }],
    },
    markdown: `${markdown.replace(/\n+$/, "")}\n\n${labels.join(" ")}`,
  };
}

/**
 * Runs the safety-aware markdown planner over an adapter bundle, then restores
 * the adapter's explicit note titles, which the planner derives from filenames,
 * appends `set_note_property` operations for adapter-supplied properties, and
 * turns adapter-supplied tags into `create_tag` operations plus a trailing
 * paragraph of tag chips on each tagged note.
 */
export function planImportBundle(
  bundle: ImportBundle,
  at: number,
  makeId: () => string,
  existingNotes: readonly MarkdownReferenceTarget[] = [],
  existingTags: readonly ImportTagTarget[] = [],
): ImportBundlePlan {
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
    operation.at = importedTime(note.createdAt, at);
    if (note.properties && note.properties.length > 0) {
      propertyOperations.push(
        ...buildPropertyOperations(note.properties, operation.id, at, makeId),
      );
    }
  }
  const tags = resolveImportedTags(bundle, existingTags, at, makeId);
  plan.operations.push(...tags.operations);
  let tagSkippedNotes = 0;
  let tagPropertyNotes = 0;
  for (const operation of plan.contentOperations) {
    if (operation.type !== "save_document") {
      continue;
    }
    const path = idToPath.get(operation.noteId);
    const note = path === undefined ? undefined : noteByPath.get(path);
    if (note) {
      operation.at = importedTime(
        note.modifiedAt,
        importedTime(note.createdAt, at),
      );
    }
    if (!note?.tags || note.tags.length === 0) {
      continue;
    }
    if (hasLosslessMarkdownDocument(operation.documentJson)) {
      const values = [...new Set(note.tags.map((tag) => tag.trim()).filter(Boolean))];
      if (values.length > 0) {
        propertyOperations.push(
          ...buildPropertyOperations(
            [{ name: "Tags", value: { type: "list", values } }],
            operation.noteId,
            at,
            makeId,
            note.properties?.length ?? 0,
          ),
        );
        tagPropertyNotes += 1;
      } else {
        tagSkippedNotes += 1;
      }
      continue;
    }
    const appended = appendTagChips(
      operation.documentJson,
      operation.markdown,
      note.tags,
      tags.idByName,
    );
    if (appended) {
      operation.documentJson = appended.documentJson;
      operation.markdown = appended.markdown;
    }
  }
  plan.operations.push(...propertyOperations);
  return {
    ...plan,
    createdTags: tags.operations.length,
    tagSkippedNotes,
    tagPropertyNotes,
  };
}
