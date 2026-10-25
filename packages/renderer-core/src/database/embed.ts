import { JOURNAL_ROOT_ID } from "../journal/constants";
import type { RendererState } from "../store/types";

export type EmbeddableFolder = {
  id: string;
  path: string;
};

const PATH_SEPARATOR = "/";

function foldTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}

function pathSegments(path: string): string[] {
  return path
    .split(PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

/**
 * @name resolveFolderPath
 * @description Finds the live folder a database block names by its path from
 * the workspace root, comparing titles case-insensitively. Returns null when no
 * folder matches, so the block can say so instead of showing the wrong notes.
 * @example
 * const folderId = resolveFolderPath(store.getState(), "Projects/Books");
 */
export function resolveFolderPath(
  state: Pick<RendererState, "nodes" | "childrenByParent">,
  path: string,
): string | null {
  const segments = pathSegments(path);
  if (segments.length === 0) return null;
  let parentId: string | null = null;
  for (const segment of segments) {
    const wanted = foldTitle(segment);
    const children: readonly string[] = state.childrenByParent.get(parentId) ?? [];
    const match: string | undefined = children.find((childId) => {
      const child = state.nodes.get(childId);
      return (
        child?.kind === "folder" && childId !== JOURNAL_ROOT_ID && foldTitle(child.title) === wanted
      );
    });
    if (match === undefined) return null;
    parentId = match;
  }
  return parentId;
}

/**
 * @name embeddableFolders
 * @description Lists every live folder outside the journal with its path from
 * the workspace root, in tree order, for choosing what a database block shows.
 * @example
 * const folders = embeddableFolders(store.getState());
 */
export function embeddableFolders(
  state: Pick<RendererState, "nodes" | "nodeOrder">,
): EmbeddableFolder[] {
  const folders: EmbeddableFolder[] = [];
  for (const id of state.nodeOrder) {
    const node = state.nodes.get(id);
    if (node?.kind !== "folder" || id === JOURNAL_ROOT_ID) continue;
    const titles: string[] = [];
    let current: typeof node | undefined = node;
    let insideJournal = false;
    while (current) {
      if (current.id === JOURNAL_ROOT_ID) insideJournal = true;
      titles.unshift(current.title.trim());
      current = current.parentId === null ? undefined : state.nodes.get(current.parentId);
    }
    if (insideJournal || titles.some((title) => title === "" || title.includes(PATH_SEPARATOR))) {
      continue;
    }
    folders.push({ id, path: titles.join(PATH_SEPARATOR) });
  }
  return folders;
}
