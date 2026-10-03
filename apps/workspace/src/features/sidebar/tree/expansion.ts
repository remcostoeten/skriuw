import type { NodeRecord } from "@skriuw/renderer-core/store/types";

export function nextFolderExpansion(
  nodes: ReadonlyMap<string, NodeRecord>,
  expandedIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const anyExpandedFolder = [...expandedIds].some((id) => nodes.get(id)?.kind === "folder");
  if (anyExpandedFolder) {
    return new Set();
  }
  return new Set(
    [...nodes.values()].filter((node) => node.kind === "folder").map((node) => node.id),
  );
}
