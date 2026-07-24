import type { WorkspaceOperation } from "../contracts/workspace";
import { parseProductMarkdown, serializeProductMarkdown } from "../editor/schema";
import type { RendererState } from "../store/types";

export type MarkdownExportEntry = {
  relativePath: string;
  kind: "folder" | "note";
  markdown: string | null;
};

export type MarkdownTreeFile = {
  relativePath: string;
  content: string;
};

export type MarkdownTree = {
  directories: string[];
  files: MarkdownTreeFile[];
  skipped: number;
};

export type MarkdownImportPlan = {
  operations: WorkspaceOperation[];
  noteCount: number;
  folderCount: number;
};

type ExportSource = Pick<RendererState, "nodes" | "childrenByParent" | "documents">;

const FORBIDDEN_FILE_CHARS = /[/\\:*?"<>|]/g;

export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(FORBIDDEN_FILE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned.length > 0 ? cleaned : "Untitled";
}

function claimUniqueName(taken: Set<string>, base: string, extension: string): string {
  let candidate = `${base}${extension}`;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter})${extension}`;
    counter += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function buildNoteExportEntry(title: string, markdown: string): MarkdownExportEntry {
  return {
    relativePath: `${sanitizeFileName(title)}.md`,
    kind: "note",
    markdown,
  };
}

export function buildWorkspaceExportEntries(source: ExportSource): MarkdownExportEntry[] {
  const entries: MarkdownExportEntry[] = [];
  function walk(parentId: string | null, prefix: string): void {
    const taken = new Set<string>();
    for (const id of source.childrenByParent.get(parentId) ?? []) {
      const node = source.nodes.get(id);
      if (!node) {
        continue;
      }
      const base = sanitizeFileName(node.title);
      if (node.kind === "folder") {
        const name = claimUniqueName(taken, base, "");
        entries.push({ relativePath: `${prefix}${name}`, kind: "folder", markdown: null });
        walk(id, `${prefix}${name}/`);
      } else {
        const name = claimUniqueName(taken, base, ".md");
        entries.push({
          relativePath: `${prefix}${name}`,
          kind: "note",
          markdown: source.documents.get(id)?.markdown ?? "",
        });
      }
    }
  }
  walk(null, "");
  return entries;
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
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
    (left, right) =>
      left.split("/").length - right.split("/").length || comparePaths(left, right),
  );
}

export function planMarkdownImport(
  tree: MarkdownTree,
  at: number,
  makeId: () => string,
): MarkdownImportPlan {
  const operations: WorkspaceOperation[] = [];
  const folderIdByPath = new Map<string, string>();
  const directoryPaths = collectDirectoryPaths(tree);
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
  const files = [...tree.files].sort((left, right) =>
    comparePaths(normalizeTreePath(left.relativePath), normalizeTreePath(right.relativePath)),
  );
  for (const file of files) {
    const normalized = normalizeTreePath(file.relativePath);
    const cut = normalized.lastIndexOf("/");
    const parentId = cut === -1 ? null : (folderIdByPath.get(normalized.slice(0, cut)) ?? null);
    const fileName = cut === -1 ? normalized : normalized.slice(cut + 1);
    const document = parseProductMarkdown(file.content);
    operations.push({
      type: "create_note",
      id: makeId(),
      title: fileName.replace(/\.md$/i, ""),
      placement: { parentId, position: { type: "last" } },
      documentJson: document.toJSON(),
      markdown: serializeProductMarkdown(document),
      at,
    });
  }
  return {
    operations,
    noteCount: files.length,
    folderCount: directoryPaths.length,
  };
}
