import type { NodeRecord } from "@/store/types";

export type SidebarSearchResults = {
  folders: readonly NodeRecord[];
  notes: readonly NodeRecord[];
  folderTotal: number;
  noteTotal: number;
};

export function searchSidebarNodes(
  nodes: ReadonlyMap<string, NodeRecord>,
  nodeOrder: readonly string[],
  query: string,
  limit: number,
): SidebarSearchResults {
  const normalizedQuery = query.trim().toLowerCase();
  const folders: NodeRecord[] = [];
  const notes: NodeRecord[] = [];
  let folderTotal = 0;
  let noteTotal = 0;
  if (!normalizedQuery) {
    return { folders, notes, folderTotal, noteTotal };
  }
  for (const id of nodeOrder) {
    const node = nodes.get(id);
    if (!node || !node.title.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    if (node.kind === "folder") {
      folderTotal += 1;
      if (folders.length < limit) {
        folders.push(node);
      }
    } else {
      noteTotal += 1;
      if (notes.length < limit) {
        notes.push(node);
      }
    }
  }
  return { folders, notes, folderTotal, noteTotal };
}

export function nextFolderExpansion(
  nodes: ReadonlyMap<string, NodeRecord>,
  expandedIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const anyExpandedFolder = [...expandedIds].some(
    (id) => nodes.get(id)?.kind === "folder",
  );
  if (anyExpandedFolder) {
    return new Set();
  }
  return new Set(
    [...nodes.values()].filter((node) => node.kind === "folder").map((node) => node.id),
  );
}
