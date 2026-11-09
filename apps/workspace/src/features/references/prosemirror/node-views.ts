import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { cancelHovercard, destroyHovercard, scheduleHovercard } from "../references/hovercard";
import { activateReference } from "../navigation/navigate";
import { referenceAriaLabel, referenceText, resolveReference } from "../references/resolver";
import type { ReferenceKind } from "@skriuw/renderer-core/references/types";

export type ReferenceNodeViews = {
  nodeViews: Record<string, (node: ProseMirrorNode) => NodeView>;
  destroy: () => void;
};

type TokenPaint = {
  text: string;
  ariaLabel: string;
  availability: string;
  color: string | null;
};

type TokenBinding = {
  dom: HTMLElement;
  kind: ReferenceKind;
  targetId: string;
  fallbackLabel: string;
  painted: TokenPaint | null;
};

function referenceColor(
  state: RendererState,
  kind: ReferenceKind,
  targetId: string,
): string | null {
  if (kind === "tag") {
    return state.tags.get(targetId)?.color ?? null;
  }
  if (kind === "person") {
    return state.people.get(targetId)?.color ?? null;
  }
  return null;
}

/**
 * Every save replaces `sourceNodes`, so each token is repainted then; only the
 * values that actually changed are written, which leaves the DOM untouched
 * for the common save that renames nothing.
 */
function paintToken(store: RendererStore, binding: TokenBinding): void {
  const state = store.getState();
  const resolved = resolveReference(state, binding.kind, binding.targetId, binding.fallbackLabel);
  const next: TokenPaint = {
    text: referenceText(binding.kind, resolved),
    ariaLabel: referenceAriaLabel(binding.kind, resolved),
    availability: resolved.availability,
    color:
      resolved.availability === "resolved"
        ? referenceColor(state, binding.kind, binding.targetId)
        : null,
  };
  const previous = binding.painted;
  binding.painted = next;
  const { dom } = binding;
  if (previous?.text !== next.text) dom.textContent = next.text;
  if (previous?.ariaLabel !== next.ariaLabel) dom.setAttribute("aria-label", next.ariaLabel);
  if (previous?.availability !== next.availability) {
    dom.dataset.refAvailability = next.availability;
  }
  if (previous !== null && previous.color === next.color) return;
  if (next.color) {
    dom.style.setProperty("--reference-token-color", next.color);
    dom.dataset.refColored = "true";
  } else {
    dom.style.removeProperty("--reference-token-color");
    delete dom.dataset.refColored;
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
      painted: null,
    };
    paintToken(store, binding);
    bindings.add(binding);
    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0 || dom.dataset.refAvailability !== "resolved") {
        return;
      }
      event.preventDefault();
    }
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || dom.dataset.refAvailability !== "resolved") {
        return;
      }
      event.preventDefault();
      activateReference(store, binding.kind, binding.targetId);
    }
    function handleMouseEnter() {
      if (dom.dataset.refAvailability !== "resolved") {
        return;
      }
      scheduleHovercard(store, dom, binding.kind, binding.targetId);
    }
    dom.addEventListener("mousedown", handleMouseDown);
    dom.addEventListener("click", handleClick);
    dom.addEventListener("mouseenter", handleMouseEnter);
    dom.addEventListener("mouseleave", cancelHovercard);
    return {
      dom,
      destroy: () => {
        dom.removeEventListener("mousedown", handleMouseDown);
        dom.removeEventListener("click", handleClick);
        dom.removeEventListener("mouseenter", handleMouseEnter);
        dom.removeEventListener("mouseleave", cancelHovercard);
        cancelHovercard();
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
      mention_ref: (node) => createToken(node.attrs.kind === "note" ? "note" : "person", node),
    },
    destroy: () => {
      unsubscribe();
      destroyHovercard();
      bindings.clear();
    },
  };
}
