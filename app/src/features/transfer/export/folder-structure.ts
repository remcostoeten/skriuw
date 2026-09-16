import type { RendererState } from "@/store/types";

type StructureSource = Pick<RendererState, "nodes" | "childrenByParent" | "documents">;

export type FolderStructureNode =
  | { kind: "note"; title: string; markdown: string }
  | {
      kind: "folder";
      title: string;
      children: FolderStructureNode[];
      truncated?: true;
    };

export type FolderStructureFormat = "json" | "tree";

/** Depth limits offered by the folder "Copy structure" menu; null means unlimited. */
export const FOLDER_STRUCTURE_DEPTHS: readonly (number | null)[] = [null, 1, 2, 3];

/**
 * Builds a recursive snapshot of a folder. `maxDepth` counts levels below the
 * folder (1 = direct children only); folders cut off by the limit keep an empty
 * `children` list and `truncated: true` so consumers can tell them from empty folders.
 */
export function buildFolderStructure(
  source: StructureSource,
  folderId: string,
  maxDepth: number | null = null,
): FolderStructureNode | null {
  const root = source.nodes.get(folderId);
  if (root?.kind !== "folder") {
    return null;
  }
  function walk(id: string, depth: number): FolderStructureNode | null {
    const node = source.nodes.get(id);
    if (!node) {
      return null;
    }
    if (node.kind === "note") {
      return {
        kind: "note",
        title: node.title,
        markdown: source.documents.get(id)?.markdown ?? "",
      };
    }
    const childIds = source.childrenByParent.get(id) ?? [];
    if (maxDepth !== null && depth >= maxDepth && childIds.length > 0) {
      return { kind: "folder", title: node.title, children: [], truncated: true };
    }
    return {
      kind: "folder",
      title: node.title,
      children: childIds.flatMap((childId) => walk(childId, depth + 1) ?? []),
    };
  }
  return walk(folderId, 0);
}

/** Renders a folder snapshot in the style of the Unix `tree` command. */
export function renderFolderTree(root: FolderStructureNode): string {
  const lines = [label(root)];
  function walk(node: FolderStructureNode, indent: string): void {
    if (node.kind !== "folder") {
      return;
    }
    node.children.forEach((child, index) => {
      const last = index === node.children.length - 1;
      lines.push(`${indent}${last ? "└── " : "├── "}${label(child)}`);
      walk(child, `${indent}${last ? "    " : "│   "}`);
    });
  }
  walk(root, "");
  return lines.join("\n");
}

function label(node: FolderStructureNode): string {
  const title = node.title.trim() || "Untitled";
  if (node.kind === "note") {
    return title;
  }
  return `${title}/${node.truncated ? " …" : ""}`;
}

export function formatFolderStructure(
  source: StructureSource,
  folderId: string,
  format: FolderStructureFormat,
  maxDepth: number | null,
): string | null {
  const structure = buildFolderStructure(source, folderId, maxDepth);
  if (!structure) {
    return null;
  }
  return format === "json" ? JSON.stringify(structure, null, 2) : renderFolderTree(structure);
}
