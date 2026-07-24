import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import { resolveImageBlobUrl } from "../shared/lib/image-blob-url";
import type { RendererStore } from "../store/types";

export type ImageNodeViews = {
  nodeViews: Record<string, (node: ProseMirrorNode) => NodeView>;
  destroy: () => void;
};

type ImageBinding = {
  dom: HTMLImageElement;
  imageId: string;
};

function paintImage(store: RendererStore, binding: ImageBinding): void {
  if (binding.dom.dataset.imageState === "ready") {
    return;
  }
  const image = store.getState().images.get(binding.imageId);
  if (!image) {
    binding.dom.dataset.imageState = "loading";
    return;
  }
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

export type ImageContextMenuHandler = (imageId: string, clientX: number, clientY: number) => void;

export function createImageNodeViews(
  store: RendererStore,
  onContextMenu?: ImageContextMenuHandler,
): ImageNodeViews {
  const bindings = new Set<ImageBinding>();

  function createImage(node: ProseMirrorNode): NodeView {
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
    if (onContextMenu) {
      dom.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        onContextMenu(imageId, event.clientX, event.clientY);
      });
    }
    const binding: ImageBinding = { dom, imageId };
    bindings.add(binding);
    paintImage(store, binding);
    return {
      dom,
      destroy: () => {
        bindings.delete(binding);
      },
    };
  }

  const unsubscribe = store.subscribe(
    (state) => state.images,
    () => {
      for (const binding of bindings) {
        paintImage(store, binding);
      }
    },
  );

  return {
    nodeViews: {
      image_ref: (node) => createImage(node),
    },
    destroy: () => {
      unsubscribe();
      bindings.clear();
    },
  };
}
