import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { CODE_LANGUAGES, codeLanguageLabel } from "./code-highlight";

/**
 * Rewrites a code block's fence info string. `pos` must address the code block
 * itself; the command is a no-op when the language is already set.
 */
export function setCodeBlockLanguage(pos: number, language: string): Command {
  return (state, dispatch) => {
    if (pos < 0 || pos >= state.doc.content.size) return false;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== "code_block") return false;
    if (node.attrs.params === language) return false;
    dispatch?.(
      state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, params: language }),
    );
    return true;
  };
}

export function createCodeBlockNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let node = initialNode;
  let open = false;

  const dom = document.createElement("pre");
  dom.className = "code-block";
  const contentDOM = document.createElement("code");
  const toolbar = document.createElement("div");
  toolbar.className = "code-block-toolbar";
  toolbar.contentEditable = "false";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "code-block-language";
  const menu = document.createElement("ul");
  menu.className = "code-block-language-menu";
  toolbar.append(trigger, menu);
  dom.append(toolbar, contentDOM);

  function paint(): void {
    const params = String(node.attrs.params ?? "");
    dom.dataset.language = params;
    trigger.textContent = codeLanguageLabel(params);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    toolbar.dataset.open = open ? "true" : "false";
  }

  const closeOnOutside = (event: MouseEvent) => {
    if (event.target instanceof Node && toolbar.contains(event.target)) return;
    setOpen(false);
  };

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    if (open) {
      document.addEventListener("mousedown", closeOnOutside, true);
    } else {
      document.removeEventListener("mousedown", closeOnOutside, true);
    }
    paint();
  }

  function chooseLanguage(value: string): void {
    setOpen(false);
    const pos = getPos();
    if (pos === undefined || !view.editable) return;
    setCodeBlockLanguage(pos, value)(view.state, view.dispatch);
    view.focus();
  }

  for (const option of CODE_LANGUAGES) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.language = option.value;
    button.textContent = option.label;
    button.addEventListener("click", () => chooseLanguage(option.value));
    item.append(button);
    menu.append(item);
  }

  trigger.addEventListener("click", () => {
    if (!view.editable) return;
    setOpen(!open);
  });

  // Keeping the editor selection alive means the picker never has to restore
  // it, so choosing a language leaves the caret exactly where it was.
  toolbar.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  paint();

  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      paint();
      return true;
    },
    stopEvent: (event) => event.target instanceof Node && toolbar.contains(event.target),
    ignoreMutation: (mutation) =>
      mutation.target !== contentDOM && !contentDOM.contains(mutation.target),
    destroy() {
      document.removeEventListener("mousedown", closeOnOutside, true);
    },
  };
}
