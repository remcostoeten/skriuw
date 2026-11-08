import type {
  NoteProperty,
  ProviderImportReceipt,
  WorkspaceOperation,
} from "@skriuw/renderer-core/contracts/workspace";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import { hasLosslessMarkdownDocument } from "@/features/editor/schema";
import {
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
  journalDateProperty,
  journalMoodProperty,
} from "@/features/journal/model";
import type {
  MarkdownImportPlan,
  MarkdownImportReuseTarget,
  MarkdownReferenceTarget,
} from "./markdown";
import { planMarkdownImport } from "./markdown";
import type {
  ImportBundle,
  ImportedJournalDay,
  ImportedNote,
  ImportedNoteProperty,
} from "@/features/transfer/import/parsing/bundle";

export type ImportTagTarget = {
  id: string;
  name: string;
};

export type ImportBundlePlan = MarkdownImportPlan & {
  createdTags: number;
  tagSkippedNotes: number;
  tagPropertyNotes: number;
  skippedTags: number;
  skippedDuplicates: number;
  sourcePropertyNotes: number;
  sourcePropertyOperations: WorkspaceOperation[];
  pinnedNotes: number;
  journalDays: number;
  journalConflicts: number;
  /**
   * Creates or restores the journal folder the imported days move into. Kept
   * out of `operations` so destination grouping never reparents the journal;
   * the caller commits these first.
   */
  journalRootOperations: WorkspaceOperation[];
};

export type ImportDuplicateMode = "copy" | "skip" | "update";

export type ImportPlanOptions = {
  destinationParentId?: string | null;
  duplicateMode?: ImportDuplicateMode;
  sourceKey?: string;
  receipts?: readonly ProviderImportReceipt[];
  /**
   * Ids of notes still present in the workspace. Receipts pointing outside this
   * set are stale — their note was trashed or purged — and are ignored so the
   * source re-imports instead of skipping. Omit to trust every receipt.
   */
  presentNoteIds?: ReadonlySet<string>;
  existingDocuments?: ReadonlyMap<string, MarkdownImportReuseTarget>;
  existingPropertiesByNoteId?: ReadonlyMap<string, readonly NoteProperty[]>;
  /** Days the journal already has an entry for; an imported day on one of them stays a note. */
  existingJournalDates?: ReadonlySet<DateKey>;
  /** State of the journal folder, so imported days create or restore it when needed. */
  journalRoot?: JournalRootState;
};

export type JournalRootState = "present" | "trashed" | "missing";

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function importedTime(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
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
    property: toNoteProperty(imported, noteId, startPosition + position, makeId),
    at,
  }));
}

const SOURCE_PROPERTY_NAME = "Source";
const IMPORTED_PROPERTY_NAME = "Imported";

function localIsoDate(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Provenance properties stamped on newly created notes, skipped whenever the
 * imported file already carries a property of the same name.
 */
function importSourceProperties(
  sourceLabel: string,
  at: number,
  note: ImportedNote,
): ImportedNoteProperty[] {
  const taken = new Set(
    (note.properties ?? []).map((property) => property.name.trim().toLowerCase()),
  );
  return [
    {
      name: SOURCE_PROPERTY_NAME,
      value: { type: "text" as const, value: sourceLabel },
    },
    {
      name: IMPORTED_PROPERTY_NAME,
      value: { type: "date" as const, value: localIsoDate(at) },
    },
  ].filter((property) => !taken.has(property.name.toLowerCase()));
}

type JournalClaim = {
  dayByPath: Map<string, ImportedJournalDay>;
  conflicts: number;
};

function claimJournalDays(
  notes: readonly ImportedNote[],
  reuseNotesByPath: ReadonlyMap<string, MarkdownImportReuseTarget>,
  existingDates: ReadonlySet<DateKey> = new Set(),
): JournalClaim {
  const dayByPath = new Map<string, ImportedJournalDay>();
  const claimed = new Set(existingDates);
  let conflicts = 0;
  for (const note of notes) {
    const path = normalizeTreePath(note.relativePath);
    if (!note.journalDay || reuseNotesByPath.has(path)) {
      continue;
    }
    if (claimed.has(note.journalDay.dateKey)) {
      conflicts += 1;
      continue;
    }
    claimed.add(note.journalDay.dateKey);
    dayByPath.set(path, note.journalDay);
  }
  return { dayByPath, conflicts };
}

function journalDayProperties(
  noteId: string,
  day: ImportedJournalDay,
  position: number,
): NoteProperty[] {
  return [
    journalDateProperty(noteId, day.dateKey, position),
    ...(day.mood === null ? [] : [journalMoodProperty(noteId, day.mood, position + 1)]),
  ];
}

function dropEmptiedFolders(
  operations: WorkspaceOperation[],
  folderIds: ReadonlySet<string>,
): number {
  let candidates = new Set(folderIds);
  let dropped = 0;
  while (candidates.size > 0) {
    const parents = new Set<string>();
    for (const folderId of candidates) {
      const hasChild = operations.some(
        (operation) =>
          (operation.type === "create_note" || operation.type === "create_folder") &&
          operation.placement.parentId === folderId,
      );
      const index = operations.findIndex(
        (operation) => operation.type === "create_folder" && operation.id === folderId,
      );
      const folder = operations[index];
      if (hasChild || folder?.type !== "create_folder") {
        continue;
      }
      operations.splice(index, 1);
      dropped += 1;
      if (folder.placement.parentId !== null) {
        parents.add(folder.placement.parentId);
      }
    }
    candidates = parents;
  }
  return dropped;
}

function journalRootOperations(root: JournalRootState, at: number): WorkspaceOperation[] {
  const placement = { parentId: null, position: { type: "last" as const } };
  if (root === "missing") {
    return [
      { type: "create_folder", id: JOURNAL_ROOT_ID, title: JOURNAL_ROOT_TITLE, placement, at },
    ];
  }
  if (root === "trashed") {
    return [{ type: "restore_subtree", rootId: JOURNAL_ROOT_ID, placement, at }];
  }
  return [];
}

type TagResolution = {
  idByName: Map<string, string>;
  operations: WorkspaceOperation[];
  skippedTags: number;
};

const MAX_IMPORTED_TAG_BYTES = 80;
const MAX_IMPORTED_TAGS_PER_PROPERTY = 64;

function validImportedTag(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 && new TextEncoder().encode(name).length <= MAX_IMPORTED_TAG_BYTES
    ? name
    : null;
}

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
  let skippedTags = 0;
  for (const note of bundle.notes) {
    for (const raw of note.tags ?? []) {
      const name = validImportedTag(raw);
      if (!name) {
        skippedTags += 1;
        continue;
      }
      if (idByName.has(name.toLowerCase())) {
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
  return { idByName, operations, skippedTags };
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

function appendRawTagReferences(
  documentJson: unknown,
  tags: readonly string[],
  idByName: ReadonlyMap<string, string>,
): unknown | null {
  const document = documentJson as { type?: unknown; content?: unknown[] };
  if (document.type !== "doc" || !Array.isArray(document.content)) {
    return null;
  }
  const chips: unknown[] = [];
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
  }
  return chips.length === 0
    ? null
    : {
        ...document,
        content: [...document.content, { type: "paragraph", content: chips }],
      };
}

/**
 * Runs the safety-aware markdown planner over an adapter bundle, then restores
 * the adapter's explicit note titles, which the planner derives from filenames,
 * appends `set_note_property` operations for adapter-supplied properties, and
 * turns adapter-supplied tags into `create_tag` operations plus a trailing
 * paragraph of tag chips on each tagged note.
 *
 * Provenance properties are returned separately as `sourcePropertyOperations`
 * so the preview can offer them as a choice without replanning; they are not
 * part of `operations`.
 */
export function planImportBundle(
  bundle: ImportBundle,
  at: number,
  makeId: () => string,
  existingNotes: readonly MarkdownReferenceTarget[] = [],
  existingTags: readonly ImportTagTarget[] = [],
  options: ImportPlanOptions = {},
): ImportBundlePlan {
  const duplicateMode = options.duplicateMode ?? "copy";
  const receiptByPath = new Map(
    (options.receipts ?? [])
      .filter(
        (receipt) =>
          receipt.provider === bundle.sourceId &&
          receipt.sourceKey === options.sourceKey &&
          (options.presentNoteIds?.has(receipt.noteId) ?? true),
      )
      .map((receipt) => [normalizeTreePath(receipt.sourcePath), receipt]),
  );
  const skippedPaths = new Set<string>();
  const reuseNotesByPath = new Map<string, MarkdownImportReuseTarget>();
  for (const note of bundle.notes) {
    const path = normalizeTreePath(note.relativePath);
    const receipt = receiptByPath.get(path);
    if (!receipt) {
      continue;
    }
    if (duplicateMode === "skip") {
      skippedPaths.add(path);
    } else if (duplicateMode === "update") {
      const existing = options.existingDocuments?.get(receipt.noteId);
      if (existing) {
        reuseNotesByPath.set(path, existing);
      }
    }
  }
  const includedNotes = bundle.notes.filter(
    (note) => !skippedPaths.has(normalizeTreePath(note.relativePath)),
  );
  const journal = claimJournalDays(includedNotes, reuseNotesByPath, options.existingJournalDates);
  const plannedBundle = {
    ...bundle,
    notes: includedNotes,
    directories: bundle.directories.filter((directory) => {
      const prefix = `${normalizeTreePath(directory)}/`;
      function holdsNote(note: ImportedNote) {
        return normalizeTreePath(note.relativePath).startsWith(prefix);
      }
      return includedNotes.some(holdsNote) || !bundle.notes.some(holdsNote);
    }),
  };
  const plan = planMarkdownImport(
    {
      directories: plannedBundle.directories,
      files: plannedBundle.notes.map((note) => ({
        relativePath: note.relativePath,
        content: note.markdown,
      })),
      skipped: 0,
    },
    at,
    makeId,
    existingNotes,
    {
      destinationParentId: options.destinationParentId,
      reuseNotesByPath,
    },
  );
  const noteByPath = new Map(
    plannedBundle.notes.map((note) => [normalizeTreePath(note.relativePath), note]),
  );
  const idToPath = new Map(plan.notes.map((note) => [note.id, note.relativePath]));
  const propertyOperations: WorkspaceOperation[] = [];
  const pinnedOperations: WorkspaceOperation[] = [];
  const sourcePropertyOperations: WorkspaceOperation[] = [];
  const provenanceTargets: { noteId: string; note: ImportedNote }[] = [];
  const nextPositionByNoteId = new Map<string, number>();
  const journalSourceFolderIds = new Set<string>();
  let sourcePropertyNotes = 0;
  for (const operation of plan.operations) {
    if (operation.type !== "create_note" && operation.type !== "rename_node") {
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
      if (operation.type === "rename_node") {
        const importedNames = new Set(
          note.properties.map((property) => property.name.trim().toLowerCase()),
        );
        propertyOperations.push(
          ...(options.existingPropertiesByNoteId?.get(operation.id) ?? [])
            .filter((property) => importedNames.has(property.name.trim().toLowerCase()))
            .map((property): WorkspaceOperation => ({
              type: "remove_note_property",
              noteId: operation.id,
              propertyId: property.id,
              at,
            })),
        );
      }
      propertyOperations.push(
        ...buildPropertyOperations(note.properties, operation.id, at, makeId),
      );
    }
    if (operation.type === "create_note") {
      const journalDay = journal.dayByPath.get(normalizeTreePath(note.relativePath));
      let nextPosition = note.properties?.length ?? 0;
      if (journalDay) {
        if (operation.placement.parentId !== null) {
          journalSourceFolderIds.add(operation.placement.parentId);
        }
        operation.placement = { parentId: JOURNAL_ROOT_ID, position: { type: "last" } };
        const journalProperties = journalDayProperties(operation.id, journalDay, nextPosition);
        propertyOperations.push(
          ...journalProperties.map((property): WorkspaceOperation => ({
            type: "set_note_property",
            property,
            at,
          })),
        );
        nextPosition += journalProperties.length;
      }
      nextPositionByNoteId.set(operation.id, nextPosition);
      provenanceTargets.push({ noteId: operation.id, note });
      if (note.pinned === true) {
        pinnedOperations.push({
          type: "set_node_pinned",
          id: operation.id,
          pinned: true,
          at: operation.at,
        });
      }
    }
  }
  const droppedFolders = dropEmptiedFolders(plan.operations, journalSourceFolderIds);
  const tags = resolveImportedTags(plannedBundle, existingTags, at, makeId);
  plan.operations.push(...tags.operations);
  let tagSkippedNotes = 0;
  let tagPropertyNotes = 0;
  let skippedTags = tags.skippedTags;
  for (const operation of plan.contentOperations) {
    if (operation.type !== "save_document") {
      continue;
    }
    const path = idToPath.get(operation.noteId);
    const note = path === undefined ? undefined : noteByPath.get(path);
    if (note) {
      operation.at = importedTime(note.modifiedAt, importedTime(note.createdAt, at));
    }
    if (!note?.tags || note.tags.length === 0) {
      continue;
    }
    if (hasLosslessMarkdownDocument(operation.documentJson)) {
      const valid = note.tags.map(validImportedTag);
      const unique = [...new Set(valid.filter((tag) => tag !== null))];
      skippedTags += valid.filter((tag) => tag === null).length;
      skippedTags += Math.max(0, unique.length - MAX_IMPORTED_TAGS_PER_PROPERTY);
      const values = unique.slice(0, MAX_IMPORTED_TAGS_PER_PROPERTY);
      if (values.length > 0) {
        const references = appendRawTagReferences(operation.documentJson, values, tags.idByName);
        if (references) {
          operation.documentJson = references;
        }
        const tagsPosition =
          nextPositionByNoteId.get(operation.noteId) ?? note.properties?.length ?? 0;
        propertyOperations.push(
          ...buildPropertyOperations(
            [{ name: "Tags", value: { type: "list", values } }],
            operation.noteId,
            at,
            makeId,
            tagsPosition,
          ),
        );
        nextPositionByNoteId.set(operation.noteId, tagsPosition + 1);
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
  for (const { noteId, note } of provenanceTargets) {
    const sourceProperties = importSourceProperties(bundle.sourceLabel, at, note);
    if (sourceProperties.length > 0) {
      sourcePropertyOperations.push(
        ...buildPropertyOperations(
          sourceProperties,
          noteId,
          at,
          makeId,
          nextPositionByNoteId.get(noteId) ?? 0,
        ),
      );
      sourcePropertyNotes += 1;
    }
  }
  plan.operations.push(...propertyOperations, ...pinnedOperations);
  if (options.sourceKey) {
    plan.operations.push(
      ...plan.notes.map((note): WorkspaceOperation => ({
        type: "record_provider_import",
        receipt: {
          provider: bundle.sourceId,
          sourceKey: options.sourceKey ?? "",
          sourcePath: note.relativePath,
          noteId: note.id,
          importedAt: at,
        },
      })),
    );
  }
  return {
    ...plan,
    folderCount: plan.folderCount - droppedFolders,
    createdTags: tags.operations.length,
    tagSkippedNotes,
    tagPropertyNotes,
    skippedTags,
    skippedDuplicates: skippedPaths.size,
    sourcePropertyNotes,
    sourcePropertyOperations,
    pinnedNotes: pinnedOperations.length,
    journalDays: journal.dayByPath.size,
    journalConflicts: journal.conflicts,
    journalRootOperations:
      journal.dayByPath.size > 0 ? journalRootOperations(options.journalRoot ?? "missing", at) : [],
  };
}
