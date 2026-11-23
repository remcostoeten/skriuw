import { createRoot } from "react-dom/client";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { ExcalidrawBlock } from "./block";

const openers = new WeakMap<ProseMirrorNode, () => void>();

function noteTitle(store: RendererStore): string {
  const state = store.getState();
  const noteId = state.activeNoteId;
  return noteId === null ? "" : (state.nodes.get(noteId)?.title ?? "");
}

/**
 * @name openExcalidrawNode
 * @description Opens the drawing editor for a selected drawing block, so
 * Enter on the block edits it. Reports whether the node was a drawing with a
 * mounted view.
 * @example
 * if (selection instanceof NodeSelection && openExcalidrawNode(selection.node)) return true;
 */
export function openExcalidrawNode(node: ProseMirrorNode): boolean {
  const open = openers.get(node);
  if (!open) return false;
  open();
  return true;
}

/**
 * @name createExcalidrawNodeView
 * @description Renders an `excalidraw` block as a drawing preview in its own
 * React root, with the full-window Excalidraw editor opening from it. Edits
 * replace the block's `scene` attribute, so they save, undo and sync like any
 * other document change.
 * @example
 * nodeViews: { excalidraw: createExcalidrawNodeView(store) }
 */
export function createExcalidrawNodeView(store: RendererStore) {
  return function excalidrawNodeView(
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number | undefined,
  ): NodeView {
    const dom = document.createElement("div");
    dom.className = "skriuw-excalidraw-block group/excalidraw";
    dom.contentEditable = "false";
    const root = createRoot(dom);
    let current = node;
    let overlayHost: HTMLElement | null = null;

    function commit(source: string): void {
      const position = getPos();
      if (position === undefined || source === current.attrs.scene) return;
      view.dispatch(
        view.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, scene: source }),
      );
    }

    function releaseOverlayHost(): void {
      const host = overlayHost;
      overlayHost = null;
      if (host) queueMicrotask(() => host.remove());
    }

    function setEditing(next: boolean): void {
      if (next === (overlayHost !== null)) return;
      if (next) {
        if (!view.editable) return;
        overlayHost = document.createElement("div");
        document.body.append(overlayHost);
        render();
        return;
      }
      releaseOverlayHost();
      render();
      view.focus();
    }

    function register(): void {
      openers.set(current, () => setEditing(true));
    }

    function render(): void {
      root.render(
        <ExcalidrawBlock
          source={String(current.attrs.scene)}
          title={noteTitle(store)}
          editable={view.editable}
          overlayHost={overlayHost}
          onEditingChange={setEditing}
          onCommit={commit}
        />,
      );
    }

    register();
    render();
    return {
      dom,
      update(next) {
        if (next.type !== current.type) return false;
        current = next;
        register();
        render();
        return true;
      },
      selectNode() {
        dom.classList.add("ProseMirror-selectednode");
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      stopEvent: (event) =>
        event.target instanceof Element && event.target.closest("button, input") !== null,
      ignoreMutation: () => true,
      destroy() {
        const host = overlayHost;
        overlayHost = null;
        // Unmounting synchronously while ProseMirror is mid-render makes React warn.
        queueMicrotask(() => {
          root.unmount();
          host?.remove();
        });
      },
    };
  };
}
