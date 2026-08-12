import { formatRelativeTime } from "@/shared/lib/relative-time";
import type { RendererStore } from "@/store/types";
import { projectReferencingNotes } from "./reference-panel-model";
import type { ReferenceKind } from "./types";

type HovercardContent = {
  title: string;
  color: string | null;
  meta: string;
  detail: string | null;
};

const HOVER_DELAY = 380;

let panel: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function ensurePanel(): HTMLElement {
  if (panel) {
    return panel;
  }
  const element = document.createElement("div");
  element.className = "reference-hovercard";
  element.setAttribute("role", "tooltip");
  document.body.append(element);
  panel = element;
  return element;
}

function describe(
  store: RendererStore,
  kind: ReferenceKind,
  targetId: string,
): HovercardContent | null {
  const state = store.getState();
  if (kind === "tag") {
    const tag = state.tags.get(targetId);
    if (!tag) {
      return null;
    }
    const noteCount = projectReferencingNotes(state, "tag", targetId).length;
    return {
      title: `#${tag.name}`,
      color: tag.color,
      meta: `${noteCount} ${noteCount === 1 ? "note" : "notes"}`,
      detail: tag.createdAt > 0 ? `created ${formatRelativeTime(tag.createdAt)}` : null,
    };
  }
  if (kind === "person") {
    const person = state.people.get(targetId);
    if (!person) {
      return null;
    }
    const noteCount = projectReferencingNotes(state, "person", targetId).length;
    return {
      title: `$${person.name}`,
      color: person.color,
      meta: `${noteCount} ${noteCount === 1 ? "note" : "notes"}`,
      detail: person.note ?? (person.createdAt > 0 ? `created ${formatRelativeTime(person.createdAt)}` : null),
    };
  }
  const note = state.nodes.get(targetId);
  if (!note) {
    return null;
  }
  const wordCount = state.documents.get(targetId)?.wordCount ?? 0;
  return {
    title: `@${note.title}`,
    color: null,
    meta: `${wordCount} ${wordCount === 1 ? "word" : "words"}`,
    detail: null,
  };
}

function render(content: HovercardContent): HTMLElement {
  const element = ensurePanel();
  element.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "reference-hovercard-title";
  if (content.color) {
    const swatch = document.createElement("span");
    swatch.className = "reference-hovercard-swatch";
    swatch.style.background = content.color;
    heading.append(swatch);
  }
  heading.append(document.createTextNode(content.title));
  element.append(heading);
  const meta = document.createElement("div");
  meta.className = "reference-hovercard-meta";
  meta.textContent = content.meta;
  element.append(meta);
  if (content.detail) {
    const detail = document.createElement("div");
    detail.className = "reference-hovercard-detail";
    detail.textContent = content.detail;
    element.append(detail);
  }
  return element;
}

function position(element: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  element.style.visibility = "hidden";
  element.dataset.open = "true";
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const margin = 8;
  let left = rect.left;
  if (left + width + margin > window.innerWidth) {
    left = window.innerWidth - width - margin;
  }
  let top = rect.bottom + 6;
  if (top + height + margin > window.innerHeight) {
    top = rect.top - height - 6;
  }
  element.style.left = `${Math.max(margin, left)}px`;
  element.style.top = `${Math.max(margin, top)}px`;
  element.style.visibility = "visible";
}

export function scheduleHovercard(
  store: RendererStore,
  anchor: HTMLElement,
  kind: ReferenceKind,
  targetId: string,
): void {
  cancelHovercard();
  showTimer = setTimeout(() => {
    const content = describe(store, kind, targetId);
    if (!content) {
      return;
    }
    position(render(content), anchor);
  }, HOVER_DELAY);
}

export function cancelHovercard(): void {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (panel) {
    delete panel.dataset.open;
  }
}

export function destroyHovercard(): void {
  cancelHovercard();
  panel?.remove();
  panel = null;
}
