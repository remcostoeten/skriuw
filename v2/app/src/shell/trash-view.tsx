import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DOMSerializer } from "prosemirror-model";
import { emptyTrash, purgeSubtree, restoreSubtree } from "../actions/workspace";
import { productSchema } from "../editor/schema";
import {
  FileTextIcon,
  FolderIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "../shared/icons";
import { Button } from "../shared/ui/button";
import { Dialog } from "../shared/ui/dialog";
import { InlineConfirm } from "../shared/ui/inline-confirm";
import {
  isNodeInSubtree,
  trashWindowRange,
  trashedRoots,
  trashedSubtreeNodes,
} from "../store/trash";
import type { TrashRoot } from "../store/trash";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { WorkspaceNode } from "../contracts/workspace";
import type { RendererState, RendererStore } from "../store/types";
import { cn } from "../shared/lib/utils";

type Props = {
  store: RendererStore;
};

const kickerClass =
  "block text-[10px] font-semibold uppercase tracking-[0.065em] text-theme-dim";
const previewTitleClass =
  "mt-[7px] border-b border-theme-divider pb-[18px] text-2xl font-[620] tracking-[-0.025em] text-foreground";

const deletedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDeletedAt(value: number): string {
  return deletedAtFormatter.format(new Date(value));
}

function rootSummary(root: TrashRoot): string {
  if (root.kind === "note") {
    return "Note";
  }
  const notes = `${root.noteCount} ${root.noteCount === 1 ? "note" : "notes"}`;
  const folders = `${root.folderCount} ${root.folderCount === 1 ? "folder" : "folders"}`;
  return `${folders}, ${notes}`;
}

function selectSourceNodes(state: RendererState) {
  return state.sourceNodes;
}

function selectDocuments(state: RendererState) {
  return state.documents;
}

export function TrashView({ store }: Props) {
  const sourceNodes = useRendererSelector(store, selectSourceNodes);
  const documents = useRendererSelector(store, selectDocuments);
  const roots = useMemo(() => trashedRoots(sourceNodes), [sourceNodes]);
  const [requestedRootId, setRequestedRootId] = useState<string | null>(null);
  const [requestedPreviewId, setRequestedPreviewId] = useState<string | null>(null);
  const [emptyIds, setEmptyIds] = useState<readonly string[] | null>(null);
  const selectedRoot =
    roots.find((root) => root.id === requestedRootId) ?? roots[0] ?? null;
  const subtree = useMemo(
    () => (selectedRoot ? trashedSubtreeNodes(sourceNodes, selectedRoot.id) : []),
    [selectedRoot, sourceNodes],
  );
  const previewNode =
    selectedRoot &&
    requestedPreviewId &&
    isNodeInSubtree(sourceNodes, requestedPreviewId, selectedRoot.id)
      ? sourceNodes.get(requestedPreviewId)
      : selectedRoot
        ? sourceNodes.get(selectedRoot.id)
        : undefined;

  function selectRoot(id: string): void {
    setRequestedRootId(id);
    setRequestedPreviewId(id);
  }

  function confirmEmpty(): void {
    if (!emptyIds) {
      return;
    }
    emptyTrash(store, emptyIds);
    setEmptyIds(null);
  }

  return (
    <main
      className="col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="trash-title"
    >
      <header className="flex min-h-[76px] items-center justify-between gap-6 border-b border-theme-divider py-3.5 pl-[22px] pr-[calc(var(--window-controls-width,112px)+8px)]">
        <div>
          <div className="flex items-center gap-2">
            <h1
              id="trash-title"
              className="text-base font-[650] tracking-[-0.015em] text-foreground"
            >
              Trash
            </h1>
            {roots.length > 0 && (
              <span className="min-w-[19px] rounded-lg border border-border px-1.5 py-0.5 text-center font-mono text-[10px] leading-[1.3] text-theme-secondary">
                {roots.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-[1.45] text-theme-secondary">
            Preview deleted items, restore them, or remove them permanently.
          </p>
        </div>
        <Button
          variant="danger"
          disabled={roots.length === 0}
          onClick={() => setEmptyIds(roots.map((root) => root.id))}
        >
          Empty trash
        </Button>
      </header>

      {roots.length === 0 ? (
        <div className="w-[min(360px,calc(100%-40px))] place-self-center text-center text-theme-secondary">
          <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
            <Trash2Icon size={22} />
          </span>
          <h2 className="text-[15px] font-[620] text-foreground">Trash is empty</h2>
          <p className="mt-1 text-xs leading-[1.45]">
            Notes and folders you delete will stay here until you remove them permanently.
          </p>
          <Button asChild className="mt-[18px]">
            <a href="#/notes">Back to notes</a>
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(220px,280px)_minmax(360px,1fr)_216px] max-[900px]:grid-cols-[minmax(210px,260px)_minmax(320px,1fr)] max-[900px]:grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-theme-divider bg-theme-sidebar max-[900px]:row-[1/-1]">
            <h2 className="sticky top-0 z-[1] bg-theme-sidebar px-3.5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.065em] text-theme-dim">
              Recently deleted
            </h2>
            <TrashList roots={roots} selectedId={selectedRoot?.id ?? null} onSelect={selectRoot} />
          </div>

          <article
            className="min-w-0 overflow-y-auto bg-theme-editor px-[clamp(32px,6vw,80px)] py-[42px]"
            aria-label="Deleted item preview"
          >
            {previewNode?.kind === "note" ? (
              <NotePreview
                node={previewNode}
                documentJson={documents.get(previewNode.id)?.documentJson}
                markdown={documents.get(previewNode.id)?.markdown ?? ""}
              />
            ) : previewNode ? (
              <FolderPreview
                root={previewNode}
                nodes={subtree}
                onPreview={setRequestedPreviewId}
              />
            ) : null}
          </article>

          {selectedRoot && (
            <aside
              className="flex min-h-0 flex-col gap-[18px] border-l border-theme-divider bg-theme-sidebar px-4 py-[18px] text-[11px] text-theme-secondary max-[900px]:col-start-2 max-[900px]:row-start-2 max-[900px]:grid max-[900px]:grid-cols-2 max-[900px]:border-l-0 max-[900px]:border-t"
              aria-label="Trash item actions"
            >
              <div>
                <span className={cn(kickerClass, "mb-[5px]")}>Deleted</span>
                <time dateTime={new Date(selectedRoot.deletedAt).toISOString()}>
                  {formatDeletedAt(selectedRoot.deletedAt)}
                </time>
              </div>
              <div>
                <span className={cn(kickerClass, "mb-[5px]")}>Contents</span>
                <span>{rootSummary(selectedRoot)}</span>
              </div>
              <div className="mt-auto grid gap-[7px] max-[900px]:col-span-full max-[900px]:grid-cols-2">
                <Button
                  variant="primary"
                  onClick={() => restoreSubtree(store, selectedRoot.id)}
                >
                  <RotateCcwIcon size={14} />
                  Restore {selectedRoot.kind}
                </Button>
                <InlineConfirm
                  confirmLabel="Delete permanently"
                  onConfirm={() => purgeSubtree(store, selectedRoot.id)}
                  renderIdle={(arm) => (
                    <Button variant="danger" onClick={arm}>
                      Delete permanently
                    </Button>
                  )}
                />
              </div>
            </aside>
          )}
        </div>
      )}

      <Dialog
        open={emptyIds !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEmptyIds(null);
          }
        }}
        title="Empty trash?"
        className="w-[min(420px,calc(100vw-32px))]"
      >
        <p className="mb-2 text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
          {`This permanently deletes ${emptyIds?.length ?? 0} ${emptyIds?.length === 1 ? "item" : "items"}.`}
        </p>
        <p className="mb-2 text-xs leading-normal text-[hsl(var(--theme-text-secondary))]">
          This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="default" onClick={() => setEmptyIds(null)}>
            Cancel
          </Button>
          <Button variant="dangerFilled" onClick={confirmEmpty}>
            Empty trash
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

const TRASH_ROW_HEIGHT = 60;
const TRASH_LIST_OVERSCAN = 5;

type TrashListProps = {
  roots: readonly TrashRoot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function TrashList({ roots, selectedId, onSelect }: TrashListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ height: 720, scrollTop: 0 });
  const { start, end } = trashWindowRange(
    roots.length,
    viewport.scrollTop,
    viewport.height,
    TRASH_ROW_HEIGHT,
    TRASH_LIST_OVERSCAN,
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const updateHeight = () => {
      setViewport((current) => ({ ...current, height: element.clientHeight }));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const pendingId = pendingFocusIdRef.current;
    if (!pendingId) {
      return;
    }
    const button = ref.current?.querySelector<HTMLButtonElement>(
      `[data-trash-id="${CSS.escape(pendingId)}"]`,
    );
    if (button) {
      button.focus();
      pendingFocusIdRef.current = null;
    }
  }, [end, selectedId, start]);

  function selectAt(index: number): void {
    const next = roots[Math.max(0, Math.min(roots.length - 1, index))];
    if (!next) {
      return;
    }
    pendingFocusIdRef.current = next.id;
    onSelect(next.id);
    const element = ref.current;
    if (!element) {
      return;
    }
    const rowTop = index * TRASH_ROW_HEIGHT;
    const rowBottom = rowTop + TRASH_ROW_HEIGHT;
    if (rowTop < element.scrollTop) {
      element.scrollTop = rowTop;
    } else if (rowBottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = rowBottom - element.clientHeight;
    }
  }

  return (
    <div
      ref={ref}
      className="min-h-0 overflow-y-auto"
      onScroll={(event) =>
        setViewport((current) => ({
          ...current,
          scrollTop: event.currentTarget.scrollTop,
        }))
      }
    >
      <ul
        aria-label="Deleted items"
        className="relative"
        style={{ height: `${roots.length * TRASH_ROW_HEIGHT}px` }}
      >
        {roots.slice(start, end).map((root, offset) => {
          const index = start + offset;
          return (
            <li
              key={root.id}
              className="absolute inset-x-0 top-0 h-[60px]"
              aria-posinset={index + 1}
              aria-setsize={roots.length}
              style={{ transform: `translateY(${index * TRASH_ROW_HEIGHT}px)` }}
            >
              <button
                type="button"
                className={cn(
                  "mx-1.5 mb-0.5 grid min-h-[58px] w-[calc(100%-12px)] cursor-pointer grid-cols-[20px_minmax(0,1fr)] gap-x-2 rounded-lg border border-transparent px-2.5 py-[9px] text-left text-theme-secondary hover:border-border hover:bg-muted",
                  selectedId === root.id && "border-border bg-foreground/10 text-foreground",
                )}
                data-trash-id={root.id}
                aria-pressed={selectedId === root.id}
                onClick={() => onSelect(root.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    selectAt(index + 1);
                    event.preventDefault();
                  } else if (event.key === "ArrowUp") {
                    selectAt(index - 1);
                    event.preventDefault();
                  } else if (event.key === "Home") {
                    selectAt(0);
                    event.preventDefault();
                  } else if (event.key === "End") {
                    selectAt(roots.length - 1);
                    event.preventDefault();
                  }
                }}
              >
                <span className="inline-flex justify-center pt-px text-muted-foreground" aria-hidden="true">
                  {root.kind === "folder" ? (
                    <FolderIcon size={15} />
                  ) : (
                    <FileTextIcon size={15} />
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <strong className="truncate text-xs font-[570]">{root.title}</strong>
                  <span className="truncate text-[10px] leading-[1.3] text-theme-dim">
                    {rootSummary(root)}
                  </span>
                </span>
                <time
                  className="col-start-2 mt-[3px] truncate font-mono text-[10px] leading-[1.3] text-theme-dim"
                  dateTime={new Date(root.deletedAt).toISOString()}
                >
                  {formatDeletedAt(root.deletedAt)}
                </time>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type NotePreviewProps = {
  node: WorkspaceNode;
  documentJson: unknown;
  markdown: string;
};

function NotePreview({ node, documentJson, markdown }: NotePreviewProps) {
  return (
    <div className="prosemirror-host mx-auto w-[min(100%,72ch)]">
      <span className={kickerClass}>Note preview</span>
      <h2 className={previewTitleClass}>{node.title}</h2>
      <PreviewDocument documentJson={documentJson} markdown={markdown} />
    </div>
  );
}

type PreviewDocumentProps = {
  documentJson: unknown;
  markdown: string;
};

function PreviewDocument({ documentJson, markdown }: PreviewDocumentProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) {
      return;
    }
    host.replaceChildren();
    try {
      const documentNode = productSchema.nodeFromJSON(documentJson);
      host.append(DOMSerializer.fromSchema(productSchema).serializeFragment(documentNode.content));
    } catch {
      host.textContent = markdown;
    }
  }, [documentJson, markdown]);
  return markdown.trim().length > 0 ? (
    <div ref={ref} className="ProseMirror wrap-anywhere pt-6 text-sm text-foreground/86" />
  ) : (
    <p className="mt-6 text-[13px] text-theme-dim">This note has no content.</p>
  );
}

type FolderPreviewProps = {
  root: WorkspaceNode;
  nodes: readonly WorkspaceNode[];
  onPreview: (id: string) => void;
};

function FolderPreview({ root, nodes, onPreview }: FolderPreviewProps) {
  const descendants = nodes.slice(1);
  const depths = new Map<string, number>();
  for (const node of nodes) {
    depths.set(node.id, node.parentId === null ? 0 : (depths.get(node.parentId) ?? -1) + 1);
  }
  return (
    <div className="mx-auto w-[min(100%,72ch)]">
      <span className={kickerClass}>Folder contents</span>
      <h2 className={previewTitleClass}>{root.title}</h2>
      {descendants.length > 0 ? (
        <ul className="mt-4">
          {descendants.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent pr-2.5 text-left text-xs text-theme-secondary hover:border-border hover:bg-muted hover:text-foreground"
                onClick={() => onPreview(node.id)}
                style={{ paddingLeft: `${12 + (depths.get(node.id) ?? 0) * 18}px` }}
              >
                {node.kind === "folder" ? (
                  <FolderIcon size={14} />
                ) : (
                  <FileTextIcon size={14} />
                )}
                <span>{node.title}</span>
                {node.deletedAt !== null && (
                  <em className="ml-auto text-[10px] not-italic text-theme-dim">
                    Deleted separately
                  </em>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-[13px] text-theme-dim">This folder is empty.</p>
      )}
    </div>
  );
}
