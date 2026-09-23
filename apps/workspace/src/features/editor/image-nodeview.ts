import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { resolveImageBlobUrl } from "@/shared/lib/image-blob-url";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { mediaUploadState, setMediaUploadState, subscribeMediaUploads } from "./media-upload-state";
import {
  createTouchActionBar,
  createUploadStatus,
  prefersTouchActions,
  type TouchAction,
} from "./media-touch-ui";

export type ImageNodeViews = {
  nodeViews: Record<
    string,
    (node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) => NodeView
  >;
  destroy: () => void;
};

type ImageBinding = {
  frame: HTMLElement;
  dom: HTMLImageElement;
  imageId: string;
  remove: () => void;
};

export type ImageContextMenuHandler = (imageId: string, clientX: number, clientY: number) => void;

/** Direct image actions for the touch toolbar; without them it opens the context menu. */
export type ImageTouchActions = {
  rename: (imageId: string) => void;
  view: (imageId: string) => void;
  info: (imageId: string) => void;
};

function paintUploadStatus(binding: ImageBinding): boolean {
  const upload = mediaUploadState(binding.imageId);
  const existing = binding.frame.querySelector("[data-upload-status]");
  if (!upload) {
    existing?.remove();
    binding.dom.hidden = false;
    return false;
  }
  binding.dom.hidden = true;
  binding.dom.dataset.imageState = upload.status === "failed" ? "failed" : "loading";
  existing?.remove();
  binding.frame.append(createUploadStatus(upload, binding.remove));
  return true;
}

function paintImage(store: RendererStore, binding: ImageBinding): void {
  if (binding.dom.dataset.imageState === "ready") {
    return;
  }
  const image = store.getState().images.get(binding.imageId);
  if (!image) {
    if (!paintUploadStatus(binding)) {
      binding.dom.dataset.imageState = "loading";
    }
    return;
  }
  paintUploadStatus(binding);
  binding.dom.dataset.imageState = "loading";
  resolveImageBlobUrl(image.contentHash, image.mimeType)
    .then((url) => {
      binding.dom.src = url;
      binding.dom.dataset.imageState = "ready";
    })
    .catch(() => {
      binding.dom.dataset.imageState = "missing";
    });
}

function anchorPoint(anchor: HTMLElement): { x: number; y: number } {
  const rect = anchor.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.bottom };
}

export function createImageNodeViews(
  store: RendererStore,
  onContextMenu?: ImageContextMenuHandler,
  touchActions?: ImageTouchActions,
): ImageNodeViews {
  const bindings = new Set<ImageBinding>();

  function actionsFor(imageId: string, remove: () => void): TouchAction[] {
    const actions: TouchAction[] = [];
    if (touchActions) {
      actions.push(
        { label: "View", run: () => touchActions.view(imageId) },
        { label: "Info", run: () => touchActions.info(imageId) },
        { label: "Rename", run: () => touchActions.rename(imageId) },
      );
    } else if (onContextMenu) {
      actions.push({
        label: "More",
        run: (anchor) => {
          const point = anchorPoint(anchor);
          onContextMenu(imageId, point.x, point.y);
        },
      });
    }
    actions.push({ label: "Delete", run: () => remove() });
    return actions;
  }

  function createImage(
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number | undefined,
  ): NodeView {
    const frame = document.createElement("span");
    frame.className = "note-image-frame relative inline-block max-w-full align-middle";
    const dom = document.createElement("img");
    dom.className = "note-image";
    const imageId = String(node.attrs.id);
    dom.dataset.imageId = imageId;
    dom.alt = String(node.attrs.alt);
    if (node.attrs.width) {
      dom.width = Number(node.attrs.width);
    }
    if (node.attrs.height) {
      dom.height = Number(node.attrs.height);
    }
    frame.append(dom);
    if (onContextMenu) {
      frame.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        onContextMenu(imageId, event.clientX, event.clientY);
      });
    }
    function remove(): void {
      const position = getPos();
      if (position === undefined) return;
      const current = view.state.doc.nodeAt(position);
      if (!current || current.type.name !== "image_ref") return;
      setMediaUploadState(imageId, null);
      view.dispatch(view.state.tr.delete(position, position + current.nodeSize));
    }
    let actionBar: HTMLElement | null = null;
    const binding: ImageBinding = { frame, dom, imageId, remove };
    bindings.add(binding);
    paintImage(store, binding);
    return {
      dom: frame,
      selectNode() {
        frame.classList.add("ProseMirror-selectednode");
        if (!prefersTouchActions() || actionBar) return;
        actionBar = createTouchActionBar(actionsFor(imageId, remove));
        frame.append(actionBar);
      },
      deselectNode() {
        frame.classList.remove("ProseMirror-selectednode");
        actionBar?.remove();
        actionBar = null;
      },
      stopEvent: (event) =>
        event.target instanceof Element &&
        event.target.closest("[data-media-actions], [data-upload-status]") !== null,
      ignoreMutation: () => true,
      destroy: () => {
        bindings.delete(binding);
      },
    };
  }

  function repaintAll(): void {
    for (const binding of bindings) {
      paintImage(store, binding);
    }
  }

  const unsubscribe = store.subscribe((state) => state.images, repaintAll);
  const unsubscribeUploads = subscribeMediaUploads(repaintAll);

  return {
    nodeViews: {
      image_ref: (node, view, getPos) => createImage(node, view, getPos),
    },
    destroy: () => {
      unsubscribe();
      unsubscribeUploads();
      bindings.clear();
    },
  };
}
