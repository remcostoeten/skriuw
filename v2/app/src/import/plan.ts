import type { WorkspaceOperation } from "../contracts/workspace";
import type { MarkdownImportPlan } from "../export/markdown-transfer-model";
import { parseProductMarkdown, serializeProductMarkdown } from "../editor/schema";
import type { ImportBundle } from "./model";

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function collectDirectoryPaths(bundle: ImportBundle): string[] {
  const paths = new Set<string>();
  function addWithAncestors(path: string): void {
    let current = path;
    while (current.length > 0) {
      paths.add(current);
      const cut = current.lastIndexOf("/");
      current = cut === -1 ? "" : current.slice(0, cut);
    }
  }
  for (const directory of bundle.directories) {
    addWithAncestors(normalizeTreePath(directory));
  }
  for (const note of bundle.notes) {
    const normalized = normalizeTreePath(note.relativePath);
    const cut = normalized.lastIndexOf("/");
    if (cut !== -1) {
      addWithAncestors(normalized.slice(0, cut));
    }
  }
  return [...paths].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length || comparePaths(left, right),
  );
}

export function planImportBundle(
  bundle: ImportBundle,
  at: number,
  makeId: () => string,
): MarkdownImportPlan {
  const operations: WorkspaceOperation[] = [];
  const folderIdByPath = new Map<string, string>();
  const directoryPaths = collectDirectoryPaths(bundle);
  for (const path of directoryPaths) {
    const id = makeId();
    folderIdByPath.set(path, id);
    const cut = path.lastIndexOf("/");
    const parentId = cut === -1 ? null : (folderIdByPath.get(path.slice(0, cut)) ?? null);
    operations.push({
      type: "create_folder",
      id,
      title: cut === -1 ? path : path.slice(cut + 1),
      placement: { parentId, position: { type: "last" } },
      at,
    });
  }
  const sorted = [...bundle.notes].sort((left, right) =>
    comparePaths(normalizeTreePath(left.relativePath), normalizeTreePath(right.relativePath)),
  );
  const notes: MarkdownImportPlan["notes"] = [];
  for (const note of sorted) {
    const normalized = normalizeTreePath(note.relativePath);
    const cut = normalized.lastIndexOf("/");
    const parentId = cut === -1 ? null : (folderIdByPath.get(normalized.slice(0, cut)) ?? null);
    const document = parseProductMarkdown(note.markdown);
    const id = makeId();
    notes.push({ id, relativePath: normalized });
    operations.push({
      type: "create_note",
      id,
      title: note.title,
      placement: { parentId, position: { type: "last" } },
      documentJson: document.toJSON(),
      markdown: serializeProductMarkdown(document),
      at,
    });
  }
  return {
    operations,
    notes,
    noteCount: bundle.notes.length,
    folderCount: directoryPaths.length,
  };
}
