import type { WorkspaceNode } from "../contracts/workspace";

export type TrashRoot = {
  id: string;
  kind: WorkspaceNode["kind"];
  title: string;
  deletedAt: number;
  descendantCount: number;
  noteCount: number;
  folderCount: number;
};

export type TrashWindow = {
  start: number;
  end: number;
};

export type TrashRow = {
  id: string;
  kind: WorkspaceNode["kind"];
  title: string;
  deletedAt: number;
  location: string | null;
  summary: string;
  snippet: string;
};

const SNIPPET_LENGTH = 180;
const FENCE = /^\s*(```|~~~)/;
const LEADING_MARKERS = /^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/;
const IMAGES = /!\[[^\]]*\]\([^)]*\)/g;
const LINKS = /\[([^\]]*)\]\([^)]*\)/g;
const WIKILINKS = /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g;
const EMPHASIS = /[*_`~]/g;

/** Flattens note markdown into a single-line plain-text preview for trash rows. */
export function trashSnippet(markdown: string): string {
  const parts: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const text = line
      .replace(LEADING_MARKERS, "")
      .replace(IMAGES, "")
      .replace(LINKS, "$1")
      .replace(WIKILINKS, (_match, target: string, label?: string) => label ?? target)
      .replace(EMPHASIS, "")
      .trim();
    if (text.length === 0) {
      continue;
    }
    parts.push(text);
    if (parts.join(" ").length >= SNIPPET_LENGTH) {
      break;
    }
  }
  const joined = parts.join(" ");
  return joined.length > SNIPPET_LENGTH ? `${joined.slice(0, SNIPPET_LENGTH).trimEnd()}…` : joined;
}

function rootSummary(root: TrashRoot): string {
  if (root.kind === "note") {
    return "Note";
  }
  const notes = `${root.noteCount} ${root.noteCount === 1 ? "note" : "notes"}`;
  const folders = `${root.folderCount} ${root.folderCount === 1 ? "folder" : "folders"}`;
  return `${folders}, ${notes}`;
}

/**
 * Projects trashed roots into flat display rows: originating folder, a counts
 * summary, and a plain-text body snippet for notes.
 */
export function trashRows(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  documents: ReadonlyMap<string, { markdown: string }>,
): TrashRow[] {
  return trashedRoots(nodes).map((root) => {
    const parentId = nodes.get(root.id)?.parentId ?? null;
    const summary = rootSummary(root);
    return {
      id: root.id,
      kind: root.kind,
      title: root.title,
      deletedAt: root.deletedAt,
      location: parentId === null ? null : (nodes.get(parentId)?.title ?? null),
      summary,
      snippet:
        root.kind === "note" ? trashSnippet(documents.get(root.id)?.markdown ?? "") : summary,
    };
  });
}

export function filterTrashRows(rows: readonly TrashRow[], query: string): TrashRow[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...rows];
  }
  return rows.filter((row) =>
    [row.title, row.location ?? "", row.snippet].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}

export type TrashSortKey = "newest" | "oldest" | "az" | "za";

const trashComparators: Record<TrashSortKey, (left: TrashRow, right: TrashRow) => number> = {
  newest: (left, right) => right.deletedAt - left.deletedAt || left.title.localeCompare(right.title),
  oldest: (left, right) => left.deletedAt - right.deletedAt || left.title.localeCompare(right.title),
  az: (left, right) => left.title.localeCompare(right.title) || left.deletedAt - right.deletedAt,
  za: (left, right) => right.title.localeCompare(left.title) || left.deletedAt - right.deletedAt,
};

export function sortTrashRows(rows: readonly TrashRow[], key: TrashSortKey): TrashRow[] {
  return [...rows].sort(trashComparators[key]);
}

export function trashWindowRange(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number,
): TrashWindow {
  return {
    start: Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
    end: Math.min(
      itemCount,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
    ),
  };
}

function compareNodes(left: WorkspaceNode, right: WorkspaceNode): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  return left.id < right.id ? -1 : 1;
}

export function isNodeInSubtree(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  nodeId: string,
  rootId: string,
): boolean {
  let currentId: string | null = nodeId;
  const visited = new Set<string>();
  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === rootId) {
      return true;
    }
    visited.add(currentId);
    currentId = nodes.get(currentId)?.parentId ?? null;
  }
  return false;
}

function childrenByParent(
  nodes: ReadonlyMap<string, WorkspaceNode>,
): Map<string, WorkspaceNode[]> {
  const children = new Map<string, WorkspaceNode[]>();
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      continue;
    }
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  return children;
}

export function trashedSubtreeNodes(
  nodes: ReadonlyMap<string, WorkspaceNode>,
  rootId: string,
): WorkspaceNode[] {
  const children = childrenByParent(nodes);
  for (const siblings of children.values()) {
    siblings.sort(compareNodes);
  }
  const ordered: WorkspaceNode[] = [];
  const root = nodes.get(rootId);
  if (!root) {
    return ordered;
  }
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    ordered.push(node);
    const childNodes = children.get(node.id) ?? [];
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const child = childNodes[index];
      if (child) {
        stack.push(child);
      }
    }
  }
  return ordered;
}

export function trashedRoots(nodes: ReadonlyMap<string, WorkspaceNode>): TrashRoot[] {
  const children = childrenByParent(nodes);
  const roots = new Map<string, TrashRoot>();
  const visited = new Set<string>();

  function visit(node: WorkspaceNode, inheritedRootId: string | null): void {
    if (visited.has(node.id)) {
      return;
    }
    visited.add(node.id);
    const rootId = inheritedRootId ?? (node.deletedAt === null ? null : node.id);
    if (rootId !== null) {
      const existing = roots.get(rootId);
      if (existing) {
        existing.descendantCount += 1;
        existing.noteCount += node.kind === "note" ? 1 : 0;
        existing.folderCount += node.kind === "folder" ? 1 : 0;
      } else {
        roots.set(rootId, {
          id: node.id,
          kind: node.kind,
          title: node.title,
          deletedAt: node.deletedAt ?? 0,
          descendantCount: 0,
          noteCount: node.kind === "note" ? 1 : 0,
          folderCount: node.kind === "folder" ? 1 : 0,
        });
      }
    }
    for (const child of children.get(node.id) ?? []) {
      visit(child, rootId);
    }
  }

  for (const node of nodes.values()) {
    if (node.parentId === null || !nodes.has(node.parentId)) {
      visit(node, null);
    }
  }
  for (const node of nodes.values()) {
    visit(node, null);
  }

  const ordered = [...roots.values()];
  return ordered.sort((left, right) => {
    if (left.deletedAt !== right.deletedAt) {
      return right.deletedAt - left.deletedAt;
    }
    return left.title.localeCompare(right.title);
  });
}
