import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { isMediaKind, mediaTitleFromSource, type MediaKind } from "./schema";

export type MediaOpenHandler = (src: string) => void;

const placeholders: Record<MediaKind, string> = {
  video: "Paste a video URL",
  audio: "Paste an audio URL",
  file: "Paste a file URL",
};

function normalizeSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function createPlayer(kind: MediaKind, src: string, title: string, onOpen?: MediaOpenHandler) {
  if (kind !== "file") {
    const player = document.createElement(kind);
    player.className = "note-media";
    player.controls = true;
    player.src = src;
    return player;
  }
  const link = document.createElement("a");
  link.className = "note-media note-media-file";
  link.dataset.mediaFile = "true";
  link.href = src;
  link.textContent = title || mediaTitleFromSource(src);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onOpen?.(src);
  });
  return link;
}

function createEmptyState(kind: MediaKind, onSubmit: (src: string) => void) {
  const form = document.createElement("form");
  form.className = "note-media-empty";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "note-media-input";
  input.placeholder = placeholders[kind];
  input.spellcheck = false;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "note-media-submit";
  submit.textContent = "Embed";
  form.append(input, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const src = normalizeSource(input.value);
    if (src) onSubmit(src);
  });
  return { form, input };
}

/**
 * Media embeds hold a URL rather than a stored blob, so the node renders its own
 * URL field while empty instead of routing through the workspace asset path the
 * way images do.
 */
export function createMediaNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
  onOpen?: MediaOpenHandler,
): NodeView {
  const dom = document.createElement("div");
  let input: HTMLInputElement | null = null;

  function setSource(src: string): void {
    const position = getPos();
    if (position === undefined) return;
    const current = view.state.doc.nodeAt(position);
    if (!current) return;
    view.dispatch(
      view.state.tr.setNodeMarkup(position, undefined, {
        ...current.attrs,
        src,
        title: String(current.attrs.title ?? "") || mediaTitleFromSource(src),
      }),
    );
    view.focus();
  }

  function render(current: ProseMirrorNode): void {
    const kind = isMediaKind(current.attrs.kind) ? current.attrs.kind : "video";
    const src = String(current.attrs.src ?? "");
    dom.className = "note-media-block";
    dom.dataset.mediaKind = kind;
    dom.dataset.mediaState = src ? "ready" : "empty";
    dom.replaceChildren();
    input = null;
    if (!src) {
      const empty = createEmptyState(kind, setSource);
      input = empty.input;
      dom.append(empty.form);
      return;
    }
    dom.append(createPlayer(kind, src, String(current.attrs.title ?? ""), onOpen));
  }

  render(node);

  return {
    dom,
    update(next) {
      if (next.type.name !== "media") return false;
      render(next);
      return true;
    },
    selectNode() {
      dom.classList.add("is-selected");
      input?.focus();
    },
    deselectNode() {
      dom.classList.remove("is-selected");
    },
    stopEvent: (event) => event.target instanceof HTMLElement && dom.contains(event.target),
    ignoreMutation: () => true,
  };
}
