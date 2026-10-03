import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import {
  countWords,
  hasLosslessMarkdownDocument,
  parseProductMarkdown,
  productSchema,
} from "@/features/editor/schema";
import { normalizeTreePath, type MarkdownTree } from "@/features/transfer/import/parsing/tree";
import { collectRemoteImageSources } from "./images";

export type MarkdownImportPlan = {
  operations: WorkspaceOperation[];
  contentOperations: WorkspaceOperation[];
  notes: { id: string; relativePath: string }[];
  noteCount: number;
  folderCount: number;
  unresolvedReferences: number;
  remoteImages: number;
  preservedSources: number;
  createdNotes: number;
  updatedNotes: number;
  duplicateTitles: number;
};

export type MarkdownReferenceTarget = {
  id: string;
  title: string;
};

export type MarkdownImportReuseTarget = MarkdownReferenceTarget & {
  revision: number;
};

export type MarkdownImportOptions = {
  destinationParentId?: string | null;
  reuseNotesByPath?: ReadonlyMap<string, MarkdownImportReuseTarget>;
};

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectDirectoryPaths(tree: MarkdownTree): string[] {
  const paths = new Set<string>();
  function addWithAncestors(path: string): void {
    let current = path;
    while (current.length > 0) {
      paths.add(current);
      const cut = current.lastIndexOf("/");
      current = cut === -1 ? "" : current.slice(0, cut);
    }
  }
  for (const directory of tree.directories) {
    addWithAncestors(normalizeTreePath(directory));
  }
  for (const file of tree.files) {
    const normalized = normalizeTreePath(file.relativePath);
    const cut = normalized.lastIndexOf("/");
    if (cut !== -1) {
      addWithAncestors(normalized.slice(0, cut));
    }
  }
  return [...paths].sort(
    (left, right) => left.split("/").length - right.split("/").length || comparePaths(left, right),
  );
}

export function planMarkdownImport(
  tree: MarkdownTree,
  at: number,
  makeId: () => string,
  existingNotes: readonly MarkdownReferenceTarget[] = [],
  options: MarkdownImportOptions = {},
): MarkdownImportPlan {
  const operations: WorkspaceOperation[] = [];
  const contentOperations: WorkspaceOperation[] = [];
  const folderIdByPath = new Map<string, string>();
  const directoryPaths = collectDirectoryPaths(tree);
  for (const path of directoryPaths) {
    const id = makeId();
    folderIdByPath.set(path, id);
    const cut = path.lastIndexOf("/");
    const parentId =
      cut === -1
        ? (options.destinationParentId ?? null)
        : (folderIdByPath.get(path.slice(0, cut)) ?? options.destinationParentId ?? null);
    operations.push({
      type: "create_folder",
      id,
      title: cut === -1 ? path : path.slice(cut + 1),
      placement: { parentId, position: { type: "last" } },
      at,
    });
  }
  const files = [...tree.files].sort((left, right) =>
    comparePaths(normalizeTreePath(left.relativePath), normalizeTreePath(right.relativePath)),
  );
  const plannedFiles = files.map((file) => {
    const normalized = normalizeTreePath(file.relativePath);
    const cut = normalized.lastIndexOf("/");
    const fileName = cut === -1 ? normalized : normalized.slice(cut + 1);
    return {
      file,
      normalized,
      parentId:
        cut === -1
          ? (options.destinationParentId ?? null)
          : (folderIdByPath.get(normalized.slice(0, cut)) ?? options.destinationParentId ?? null),
      title: fileName.replace(/\.md$/i, ""),
      id: options.reuseNotesByPath?.get(normalized)?.id ?? makeId(),
      reuse: options.reuseNotesByPath?.get(normalized),
    };
  });
  const idsByTitle = new Map<string, string[]>();
  for (const target of [
    ...existingNotes,
    ...plannedFiles.map(({ id, title }) => ({ id, title })),
  ]) {
    const ids = idsByTitle.get(target.title) ?? [];
    if (!ids.includes(target.id)) {
      ids.push(target.id);
    }
    idsByTitle.set(target.title, ids);
  }
  const notes: MarkdownImportPlan["notes"] = [];
  let unresolvedReferences = 0;
  let remoteImages = 0;
  let preservedSources = 0;
  for (const planned of plannedFiles) {
    const document = parseProductMarkdown(planned.file.content);
    if (hasLosslessMarkdownDocument(document.toJSON())) {
      preservedSources += 1;
    }
    const resolved = resolveImportedNoteReferences(document.toJSON(), idsByTitle);
    unresolvedReferences += resolved.unresolved;
    remoteImages += collectRemoteImageSources(resolved.documentJson).length;
    const empty = parseProductMarkdown("");
    const id = planned.id;
    notes.push({ id, relativePath: planned.normalized });
    if (planned.reuse) {
      operations.push({ type: "rename_node", id, title: planned.title, at });
    } else {
      operations.push({
        type: "create_note",
        id,
        title: planned.title,
        placement: { parentId: planned.parentId, position: { type: "last" } },
        documentJson: empty.toJSON(),
        markdown: "",
        at,
      });
    }
    contentOperations.push({
      type: "save_document",
      noteId: id,
      documentJson: resolved.documentJson,
      markdown: planned.file.content,
      wordCount: countDocumentWords(resolved.documentJson),
      expectedRevision: planned.reuse?.revision ?? 1,
      at,
    });
  }
  return {
    operations,
    contentOperations,
    notes,
    noteCount: files.length,
    folderCount: directoryPaths.length,
    unresolvedReferences,
    remoteImages,
    preservedSources,
    createdNotes: plannedFiles.filter((planned) => !planned.reuse).length,
    updatedNotes: plannedFiles.filter((planned) => planned.reuse).length,
    duplicateTitles: [...idsByTitle.values()].filter((ids) => ids.length > 1).length,
  };
}

function countDocumentWords(documentJson: unknown): number {
  try {
    return countWords(productSchema.nodeFromJSON(documentJson));
  } catch {
    return 0;
  }
}

function resolveImportedNoteReferences(
  documentJson: unknown,
  idsByTitle: ReadonlyMap<string, readonly string[]>,
): { documentJson: unknown; unresolved: number } {
  let unresolved = 0;
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const node = value as {
      type?: unknown;
      attrs?: { kind?: unknown; label?: unknown };
      content?: unknown[];
    };
    if (
      node.type === "mention_ref" &&
      node.attrs?.kind === "note" &&
      typeof node.attrs.label === "string"
    ) {
      const ids = idsByTitle.get(node.attrs.label) ?? [];
      if (ids.length === 1) {
        return {
          ...node,
          attrs: { ...node.attrs, id: ids[0] },
        };
      }
      unresolved += 1;
      return { type: "text", text: `[[${node.attrs.label}]]` };
    }
    return {
      ...node,
      ...(Array.isArray(node.content) ? { content: node.content.map(visit) } : {}),
    };
  }
  return { documentJson: visit(documentJson), unresolved };
}
