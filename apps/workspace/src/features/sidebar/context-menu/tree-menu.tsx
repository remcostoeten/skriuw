import { useState } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { requestNoteShare } from "@/features/sharing/share-dialog-controller";
import { requestTemplatePicker } from "@/features/templates/picker";
import { toggleNodeLock } from "@/features/lock/lock";
import { showToast } from "@/shared/ui/toast";
import {
  CopyIcon,
  DownloadIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderInputIcon,
  FolderPlusIcon,
  FoldVerticalIcon,
  LinkIcon,
  LockIcon,
  LockOpenIcon,
  PanelRightIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  ShareIcon,
  Trash2Icon,
  UnfoldVerticalIcon,
} from "@/shared/icons/static";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { RowGestures } from "../touch/row-gestures";
import {
  FOLDER_STRUCTURE_DEPTHS,
  canShareNotes,
  copyFolderStructure,
  createFolder,
  createNote,
  exportNoteAsMarkdown,
  moveNode,
  moveTargetFolders,
  openBeside,
  openNoteInTab,
  setAllFoldersExpanded,
  setNodePinned,
  shareNoteAsText,
  trashSelectedNodes,
  type FolderStructureFormat,
} from "../tree/operations";
import { itemMenuShortcuts, rootMenuShortcuts, runMenuShortcut } from "./shortcuts";

type ContextTarget = { kind: "root" } | { kind: "item"; id: string };

type TreeMenuProps = {
  store: RendererStore;
  asideRef: RefObject<HTMLElement | null>;
  touch: RowGestures;
  onMove: (ids: readonly string[]) => void;
  children: ReactNode;
};

type StoreProps = {
  store: RendererStore;
};

type NodeProps = {
  store: RendererStore;
  id: string;
};

type MoveToProps = {
  store: RendererStore;
  id: string;
  parentId: string | null;
};

const COPY_STRUCTURE_FORMATS: { format: FolderStructureFormat; label: string }[] = [
  { format: "json", label: "As JSON" },
  { format: "tree", label: "As file tree" },
];

// One menu serves every row: a right click resolves the row under `data-row-key` instead of mounting a menu per row.
export function TreeContextMenu({ store, asideRef, touch, onMove, children }: TreeMenuProps) {
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);

  function onListContextMenu(event: MouseEvent): void {
    touch.reset();
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
    const id = rowEl?.getAttribute("data-row-key") ?? null;
    if (id === null) {
      setContextTarget({ kind: "root" });
      return;
    }
    if (!store.getState().selectedNodeIds.has(id)) {
      store.selectTreeNode(id, "replace");
    }
    store.setFocusedNode(id);
    setContextTarget({ kind: "item", id });
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        setContextTarget(null);
        touch.afterMenuClose();
      }}
    >
      <ContextMenuTrigger asChild>
        <div className="flex min-h-0 flex-1 flex-col" onContextMenu={onListContextMenu}>
          {children}
        </div>
      </ContextMenuTrigger>
      {contextTarget?.kind === "root" && (
        <ContextMenuContent
          className="w-48"
          onKeyDown={(event) => runMenuShortcut(event, rootMenuShortcuts(store))}
        >
          <RootEntries store={store} />
        </ContextMenuContent>
      )}
      {contextTarget?.kind === "item" && (
        <ContextMenuContent
          className="w-48"
          onKeyDown={(event) =>
            runMenuShortcut(event, itemMenuShortcuts(store, contextTarget.id, onMove))
          }
          onCloseAutoFocus={(event) => {
            if (store.getState().editingNodeId === null) {
              return;
            }
            // The rename field mounted while the menu trapped focus, so it can only take focus once the menu is gone.
            event.preventDefault();
            asideRef.current
              ?.querySelector<HTMLInputElement>('input[aria-label^="Rename"]')
              ?.focus();
          }}
        >
          <ItemEntries store={store} id={contextTarget.id} />
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

function RootEntries({ store }: StoreProps) {
  return (
    <>
      <ContextMenuItem onClick={() => createNote(store, null)} className="gap-2">
        <FilePlusIcon className="w-4 h-4" />
        New note
        <ContextMenuShortcut keys="N" />
      </ContextMenuItem>
      <ContextMenuItem onClick={() => requestTemplatePicker(null)} className="gap-2">
        <FileTextIcon className="w-4 h-4" />
        New note from template…
        <ContextMenuShortcut keys="T" />
      </ContextMenuItem>
      <ContextMenuItem onClick={() => createFolder(store, null)} className="gap-2">
        <FolderPlusIcon className="w-4 h-4" />
        New folder
        <ContextMenuShortcut keys="F" />
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => setAllFoldersExpanded(store, true)} className="gap-2">
        <UnfoldVerticalIcon size={14} className="h-3.5 w-3.5" />
        Expand all folders
        <ContextMenuShortcut keys="E" />
      </ContextMenuItem>
      <ContextMenuItem onClick={() => setAllFoldersExpanded(store, false)} className="gap-2">
        <FoldVerticalIcon size={14} className="h-3.5 w-3.5" />
        Collapse all folders
        <ContextMenuShortcut keys="C" />
      </ContextMenuItem>
    </>
  );
}

function MoveToSubmenu({ store, id, parentId }: MoveToProps) {
  const folders = moveTargetFolders(store.getState(), id);
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <FolderInputIcon className="w-4 h-4" />
        Move to
        <ContextMenuShortcut keys="M" />
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-48">
        {parentId !== null && (
          <ContextMenuItem
            onClick={() => moveNode(store, id, { parentId: null, position: { type: "last" } })}
          >
            Root
          </ContextMenuItem>
        )}
        {folders.length > 0
          ? folders.map((folder) => (
              <ContextMenuItem
                key={folder.id}
                onClick={() =>
                  moveNode(store, id, { parentId: folder.id, position: { type: "last" } })
                }
              >
                {folder.title}
              </ContextMenuItem>
            ))
          : parentId === null && <ContextMenuItem disabled>No folders available</ContextMenuItem>}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function CopyStructureSubmenu({ store, id }: NodeProps) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <CopyIcon className="w-4 h-4" />
        Copy structure
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44">
        {COPY_STRUCTURE_FORMATS.map(({ format, label }) => (
          <ContextMenuSub key={format}>
            <ContextMenuSubTrigger>{label}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {FOLDER_STRUCTURE_DEPTHS.map((depth) => (
                <ContextMenuItem
                  key={depth ?? "all"}
                  onClick={() => copyFolderStructure(store, id, format, depth)}
                >
                  {depth === null ? "All levels" : `${depth} level${depth === 1 ? "" : "s"} deep`}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function ItemEntries({ store, id }: NodeProps) {
  const node = store.getState().nodes.get(id);
  if (!node) {
    return null;
  }
  const isBulkSelection = store.getState().selectedNodeIds.size > 1;
  const isPinned = (store.getState().sourceNodes.get(id)?.pinnedAt ?? null) !== null;
  const isLocked = (store.getState().sourceNodes.get(id)?.lockedAt ?? null) !== null;
  return (
    <>
      {!isBulkSelection && (
        <>
          <ContextMenuItem onClick={() => store.setEditingNode(id)} className="gap-2">
            <PencilIcon className="w-4 h-4" />
            Rename
            <ContextMenuShortcut keys="R" />
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setNodePinned(store, id, !isPinned)} className="gap-2">
            {isPinned ? <PinOffIcon className="w-4 h-4" /> : <PinIcon className="w-4 h-4" />}
            {isPinned ? "Unpin" : "Pin"}
            <ContextMenuShortcut keys="P" />
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleNodeLock(store, id)} className="gap-2">
            {isLocked ? <LockOpenIcon className="w-4 h-4" /> : <LockIcon className="w-4 h-4" />}
            {isLocked
              ? node.kind === "folder"
                ? "Unlock folder"
                : "Unlock note"
              : node.kind === "folder"
                ? "Lock folder…"
                : "Lock note…"}
            <ContextMenuShortcut keys="L" />
          </ContextMenuItem>
          {node.kind === "folder" && (
            <>
              <ContextMenuItem onClick={() => createNote(store, id)} className="gap-2">
                <FilePlusIcon className="w-4 h-4" />
                New note inside
                <ContextMenuShortcut keys="N" />
              </ContextMenuItem>
              <ContextMenuItem onClick={() => requestTemplatePicker(id)} className="gap-2">
                <FileTextIcon className="w-4 h-4" />
                New note from template…
                <ContextMenuShortcut keys="T" />
              </ContextMenuItem>
              <ContextMenuItem onClick={() => createFolder(store, id)} className="gap-2">
                <FolderPlusIcon className="w-4 h-4" />
                New folder inside
                <ContextMenuShortcut keys="F" />
              </ContextMenuItem>
              <CopyStructureSubmenu store={store} id={id} />
            </>
          )}
          <MoveToSubmenu store={store} id={id} parentId={node.parentId} />
          {node.kind === "note" && (
            <>
              <ContextMenuItem onClick={() => openNoteInTab(store, id)} className="gap-2">
                <FilePlusIcon className="w-4 h-4" />
                Open in new tab
                <ContextMenuShortcut keys="O" />
              </ContextMenuItem>
              <ContextMenuItem onClick={() => openBeside(store, id)} className="gap-2">
                <PanelRightIcon className="w-4 h-4" />
                Open beside
                <ContextMenuShortcut keys="B" />
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => void exportNoteAsMarkdown(store, id)}
                className="gap-2"
              >
                <DownloadIcon className="w-4 h-4" />
                Export as Markdown…
                <ContextMenuShortcut keys="E" />
              </ContextMenuItem>
              <ContextMenuItem onClick={() => requestNoteShare(id)} className="gap-2">
                <LinkIcon className="w-4 h-4" />
                Share as link…
                <ContextMenuShortcut keys="S" />
              </ContextMenuItem>
              {canShareNotes() && (
                <ContextMenuItem
                  onClick={() => {
                    void shareNoteAsText(store, id).catch((error) => {
                      console.error("note share failed", error);
                      showToast({ message: "Sharing failed. Try exporting instead." });
                    });
                  }}
                  className="gap-2"
                >
                  <ShareIcon className="w-4 h-4" />
                  Share as text…
                </ContextMenuItem>
              )}
            </>
          )}
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem
        onClick={() => trashSelectedNodes(store, id)}
        className="gap-2 text-destructive focus:text-destructive"
      >
        <Trash2Icon className="w-4 h-4" />
        {isBulkSelection ? "Delete selected" : "Delete"}
        <ContextMenuShortcut keys="D" />
        <ContextMenuShortcut keys="⌫" className="ml-0 pl-[3px]" />
      </ContextMenuItem>
    </>
  );
}
