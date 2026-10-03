import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";

export type ImportGroupingNode = {
  id: string;
  parentId: string | null;
  kind: "note" | "folder";
  title: string;
};

export type ImportGroupingOptions = {
  destinationFolderId: string | null;
  sourceFolderLabel: string | null;
  groupByYear: boolean;
  /**
   * Workspace nodes as they stand at commit time. Grouping folders reuse an
   * existing same-named sibling instead of creating a duplicate, so repeated
   * imports of the same source land in one folder rather than stacking up.
   */
  existingNodes?: readonly ImportGroupingNode[];
};

function findGroupingFolder(
  nodes: readonly ImportGroupingNode[],
  parentId: string | null,
  title: string,
): string | null {
  const wanted = title.trim().toLowerCase();
  return (
    nodes.find(
      (node) =>
        node.kind === "folder" &&
        node.parentId === parentId &&
        node.title.trim().toLowerCase() === wanted,
    )?.id ?? null
  );
}

/**
 * Reparents the plan's root-level nodes after the preview selection: into the
 * chosen destination folder, optionally nested inside a folder named after the
 * import source, with notes optionally fanned out into per-year folders keyed
 * by their imported creation time. Returns the folder operations the caller
 * must prepend so every new parent exists before a child references it.
 */
export function applyImportGrouping(
  operations: readonly WorkspaceOperation[],
  options: ImportGroupingOptions,
  at: number,
  makeId: () => string,
): WorkspaceOperation[] {
  const rootOperations = operations.filter(
    (
      operation,
    ): operation is Extract<WorkspaceOperation, { type: "create_folder" | "create_note" }> =>
      (operation.type === "create_folder" || operation.type === "create_note") &&
      operation.placement.parentId === null,
  );
  if (rootOperations.length === 0) {
    return [];
  }
  const existingNodes = options.existingNodes ?? [];
  const folderOperations: WorkspaceOperation[] = [];
  let groupParentId = options.destinationFolderId;
  let groupParentExists = true;
  if (options.sourceFolderLabel !== null) {
    const reused = findGroupingFolder(
      existingNodes,
      options.destinationFolderId,
      options.sourceFolderLabel,
    );
    groupParentId = reused ?? makeId();
    groupParentExists = reused !== null;
    if (reused === null) {
      folderOperations.push({
        type: "create_folder",
        id: groupParentId,
        title: options.sourceFolderLabel,
        placement: {
          parentId: options.destinationFolderId,
          position: { type: "last" },
        },
        at,
      });
    }
  }
  const yearFolderIds = new Map<number, string>();
  if (options.groupByYear) {
    const years = [
      ...new Set(
        rootOperations.flatMap((operation) =>
          operation.type === "create_note" ? [new Date(operation.at).getFullYear()] : [],
        ),
      ),
    ].sort((left, right) => left - right);
    for (const year of years) {
      const reused = groupParentExists
        ? findGroupingFolder(existingNodes, groupParentId, `${year}`)
        : null;
      const id = reused ?? makeId();
      yearFolderIds.set(year, id);
      if (reused === null) {
        folderOperations.push({
          type: "create_folder",
          id,
          title: `${year}`,
          placement: { parentId: groupParentId, position: { type: "last" } },
          at,
        });
      }
    }
  }
  for (const operation of rootOperations) {
    operation.placement.parentId =
      operation.type === "create_note" && options.groupByYear
        ? (yearFolderIds.get(new Date(operation.at).getFullYear()) ?? groupParentId)
        : groupParentId;
  }
  return folderOperations;
}
