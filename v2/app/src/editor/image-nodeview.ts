import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import { readNoteImageBlob } from "../bridge/commands";
import type { RendererStore } from "../store/types";

export type ImageNodeViews = {
  nodeViews: Record<string, (node: ProseMirrorNode) => NodeView>;
  destroy: () => void;
};

type ImageBinding = {
  dom: HTMLImageElement;
  imageId: string;
};

const objectUrlByHash = new Map<string, Promise<string>>();

function resolveBlobUrl(contentHash: string, mimeType: string): Promise<string> {
  const cached = objectUrlByHash.get(contentHash);
  if (cached) {
    return cached;
  }
  const pending = readNoteImageBlob(contentHash, mimeType).then((buffer) =>
    URL.createObjectURL(new Blob([buffer], { type: mimeType })),
  );
  objectUrlByHash.set(contentHash, pending);
  pending.catch(() => {
    objectUrlByHash.delete(contentHash);
  });
  return pending;
}

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
  resolveBlobUrl(image.contentHash, image.mimeType)
    .then((url) => {
      binding.dom.src = url;
      binding.dom.dataset.imageState = "ready";
    })
    .catch(() => {
      binding.dom.dataset.imageState = "missing";
    });
}

export function createImageNodeViews(store: RendererStore): ImageNodeViews {
  const bindings = new Set<ImageBinding>();

  function createImage(node: ProseMirrorNode): NodeView {
    const dom = document.createElement("img");
    dom.className = "note-image";
    dom.dataset.imageId = String(node.attrs.id);
    dom.alt = String(node.attrs.alt);
    if (node.attrs.width) {
      dom.width = Number(node.attrs.width);
    }
    if (node.attrs.height) {
      dom.height = Number(node.attrs.height);
    }
    const binding: ImageBinding = { dom, imageId: String(node.attrs.id) };
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
