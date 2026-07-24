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
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

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

export function TrashView({ store }: Props) {
  const sourceNodes = useRendererSelector(store, (state) => state.sourceNodes);
  const documents = useRendererSelector(store, (state) => state.documents);
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
    <main className="trash-view" aria-labelledby="trash-title">
      <header className="trash-header">
        <div>
          <div className="trash-heading-row">
            <h1 id="trash-title">Trash</h1>
            {roots.length > 0 && <span className="trash-count">{roots.length}</span>}
          </div>
          <p>Preview deleted items, restore them, or remove them permanently.</p>
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
        <div className="trash-empty">
          <span className="trash-empty-icon" aria-hidden="true">
            <Trash2Icon size={22} />
          </span>
          <h2>Trash is empty</h2>
          <p>Notes and folders you delete will stay here until you remove them permanently.</p>
          <Button asChild className="mt-[18px]">
            <a href="#/notes">Back to notes</a>
          </Button>
        </div>
      ) : (
        <div className="trash-workspace">
          <div className="trash-list-pane">
            <h2>Recently deleted</h2>
            <TrashList roots={roots} selectedId={selectedRoot?.id ?? null} onSelect={selectRoot} />
          </div>

          <article className="trash-preview" aria-label="Deleted item preview">
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
            <aside className="trash-details" aria-label="Trash item actions">
              <div>
                <span className="trash-details-label">Deleted</span>
                <time dateTime={new Date(selectedRoot.deletedAt).toISOString()}>
                  {formatDeletedAt(selectedRoot.deletedAt)}
                </time>
              </div>
              <div>
                <span className="trash-details-label">Contents</span>
                <span>{rootSummary(selectedRoot)}</span>
              </div>
              <div className="trash-details-actions">
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
      className="trash-list-scroll"
      onScroll={(event) =>
        setViewport((current) => ({
          ...current,
          scrollTop: event.currentTarget.scrollTop,
        }))
      }
    >
      <ul
        aria-label="Deleted items"
        style={{ height: `${roots.length * TRASH_ROW_HEIGHT}px` }}
      >
        {roots.slice(start, end).map((root, offset) => {
          const index = start + offset;
          return (
            <li
              key={root.id}
              aria-posinset={index + 1}
              aria-setsize={roots.length}
              style={{ transform: `translateY(${index * TRASH_ROW_HEIGHT}px)` }}
            >
              <button
                type="button"
                className={`trash-list-row${selectedId === root.id ? " is-selected" : ""}`}
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
                <span className="trash-list-icon" aria-hidden="true">
                  {root.kind === "folder" ? (
                    <FolderIcon size={15} />
                  ) : (
                    <FileTextIcon size={15} />
                  )}
                </span>
                <span className="trash-list-copy">
                  <strong>{root.title}</strong>
                  <span>{rootSummary(root)}</span>
                </span>
                <time dateTime={new Date(root.deletedAt).toISOString()}>
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
    <div className="trash-note-preview prosemirror-host">
      <span className="trash-preview-kicker">Note preview</span>
      <h2>{node.title}</h2>
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
    <div ref={ref} className="trash-preview-copy ProseMirror" />
  ) : (
    <p className="trash-preview-empty">This note has no content.</p>
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
    <div className="trash-folder-preview">
      <span className="trash-preview-kicker">Folder contents</span>
      <h2>{root.title}</h2>
      {descendants.length > 0 ? (
        <ul>
          {descendants.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onPreview(node.id)}
                style={{ paddingLeft: `${12 + (depths.get(node.id) ?? 0) * 18}px` }}
              >
                {node.kind === "folder" ? (
                  <FolderIcon size={14} />
                ) : (
                  <FileTextIcon size={14} />
                )}
                <span>{node.title}</span>
                {node.deletedAt !== null && <em>Deleted separately</em>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="trash-preview-empty">This folder is empty.</p>
      )}
    </div>
  );
}
