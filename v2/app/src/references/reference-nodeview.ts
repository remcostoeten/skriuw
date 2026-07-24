import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import type { RendererState, RendererStore } from "../store/types";
import {
  referenceAriaLabel,
  referenceText,
  resolveReference,
} from "./reference-resolver";
import type { ReferenceKind } from "./types";

export type ReferenceNodeViews = {
  nodeViews: Record<string, (node: ProseMirrorNode) => NodeView>;
  destroy: () => void;
};

type TokenBinding = {
  dom: HTMLElement;
  kind: ReferenceKind;
  targetId: string;
  fallbackLabel: string;
};

function referenceColor(state: RendererState, kind: ReferenceKind, targetId: string): string | null {
  if (kind === "tag") {
    return state.tags.get(targetId)?.color ?? null;
  }
  if (kind === "person") {
    return state.people.get(targetId)?.color ?? null;
  }
  return null;
}

function paintToken(store: RendererStore, binding: TokenBinding): void {
  const state = store.getState();
  const resolved = resolveReference(state, binding.kind, binding.targetId, binding.fallbackLabel);
  binding.dom.textContent = referenceText(binding.kind, resolved);
  binding.dom.setAttribute("aria-label", referenceAriaLabel(binding.kind, resolved));
  binding.dom.dataset.refAvailability = resolved.availability;
  const color = resolved.availability === "resolved" ? referenceColor(state, binding.kind, binding.targetId) : null;
  if (color) {
    binding.dom.style.setProperty("--reference-token-color", color);
    binding.dom.dataset.refColored = "true";
  } else {
    binding.dom.style.removeProperty("--reference-token-color");
    delete binding.dom.dataset.refColored;
  }
}

export function createReferenceNodeViews(store: RendererStore): ReferenceNodeViews {
  const bindings = new Set<TokenBinding>();

  function createToken(kind: ReferenceKind, node: ProseMirrorNode): NodeView {
    const dom = document.createElement("span");
    dom.className = `reference-token reference-token-${kind}`;
    dom.dataset.refKind = kind;
    dom.dataset.refId = String(node.attrs.id);
    dom.dataset.refLabel = String(node.attrs.label);
    const binding: TokenBinding = {
      dom,
      kind,
      targetId: String(node.attrs.id),
      fallbackLabel: String(node.attrs.label),
    };
    paintToken(store, binding);
    bindings.add(binding);
    return {
      dom,
      destroy: () => {
        bindings.delete(binding);
      },
    };
  }

  const unsubscribe = store.subscribe(
    (state) => ({ tags: state.tags, people: state.people, sourceNodes: state.sourceNodes }),
    () => {
      for (const binding of bindings) {
        paintToken(store, binding);
      }
    },
    (left, right) =>
      left.tags === right.tags &&
      left.people === right.people &&
      left.sourceNodes === right.sourceNodes,
  );

  return {
    nodeViews: {
      tag_ref: (node) => createToken("tag", node),
      mention_ref: (node) =>
        createToken(node.attrs.kind === "note" ? "note" : "person", node),
    },
    destroy: () => {
      unsubscribe();
      bindings.clear();
    },
  };
}
