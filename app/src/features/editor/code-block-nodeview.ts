import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { CODE_LANGUAGES, codeLanguageLabel } from "./code-highlight";

const LANGUAGE_MENU_LABEL = "Code language";
const TYPE_AHEAD_RESET_MS = 700;

let menuSequence = 0;

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

export function codeBlockClipboardText(node: ProseMirrorNode): string {
  return node.type.name === "code_block" ? node.textContent : "";
}

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

export async function writeCodeBlockClipboard(
  text: string,
  clipboard: ClipboardWriter | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "code-block-copy";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", "Copy code");
  const menu = document.createElement("ul");
  menu.className = "code-block-language-menu";
  menu.id = `code-block-language-menu-${++menuSequence}`;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("tabindex", "-1");
  menu.setAttribute("aria-label", LANGUAGE_MENU_LABEL);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-controls", menu.id);
  trigger.setAttribute("aria-label", LANGUAGE_MENU_LABEL);
  toolbar.append(trigger, copy, menu);
  dom.append(toolbar, contentDOM);
  let copyReset: number | null = null;
  let typeAhead = "";
  let typeAheadReset: number | null = null;

  const items: HTMLButtonElement[] = [];

  function currentLanguage(): string {
    return String(node.attrs.params ?? "");
  }

  function paint(): void {
    const params = currentLanguage();
    dom.dataset.language = params;
    trigger.textContent = codeLanguageLabel(params);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    toolbar.dataset.open = open ? "true" : "false";
    for (const item of items) {
      item.setAttribute("aria-selected", item.dataset.language === params ? "true" : "false");
    }
  }

  function selectedIndex(): number {
    const params = currentLanguage();
    const index = items.findIndex((item) => item.dataset.language === params);
    return index === -1 ? 0 : index;
  }

  function focusItem(index: number): void {
    const count = items.length;
    if (count === 0) return;
    const item = items[((index % count) + count) % count];
    if (!item) return;
    for (const other of items) {
      if (other !== item) delete other.dataset.active;
    }
    item.dataset.active = "true";
    item.focus();
  }

  function focusedIndex(): number {
    return items.findIndex((item) => item === document.activeElement);
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
      for (const item of items) delete item.dataset.active;
    }
    paint();
  }

  function openAndFocus(index: number): void {
    setOpen(true);
    focusItem(index);
  }

  function closeToTrigger(): void {
    setOpen(false);
    trigger.focus();
  }

  function chooseLanguage(value: string): void {
    setOpen(false);
    const pos = getPos();
    if (pos === undefined || !view.editable) return;
    setCodeBlockLanguage(pos, value)(view.state, view.dispatch);
    view.focus();
  }

  function jumpToTypeAhead(character: string): void {
    if (typeAheadReset !== null) window.clearTimeout(typeAheadReset);
    typeAheadReset = window.setTimeout(() => {
      typeAheadReset = null;
      typeAhead = "";
    }, TYPE_AHEAD_RESET_MS);
    typeAhead += character.toLowerCase();
    const sameLetterRepeated = /^(.)\1+$/.test(typeAhead);
    const query = sameLetterRepeated ? typeAhead.slice(0, 1) : typeAhead;
    const start = focusedIndex();
    const count = items.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (start + step) % count;
      const label = items[index]?.textContent?.toLowerCase() ?? "";
      if (label.startsWith(query)) {
        focusItem(index);
        return;
      }
    }
  }

  for (const option of CODE_LANGUAGES) {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("role", "option");
    button.dataset.language = option.value;
    button.textContent = option.label;
    button.addEventListener("click", () => chooseLanguage(option.value));
    item.append(button);
    menu.append(item);
    items.push(button);
  }

  trigger.addEventListener("click", () => {
    if (!view.editable) return;
    setOpen(!open);
  });

  trigger.addEventListener("keydown", (event) => {
    if (!view.editable) return;
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        event.preventDefault();
        openAndFocus(selectedIndex());
        break;
      case "ArrowUp":
        event.preventDefault();
        openAndFocus(items.length - 1);
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        closeToTrigger();
        break;
      default:
        break;
    }
  });

  menu.addEventListener("keydown", (event) => {
    const index = focusedIndex();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const item = items[index];
        if (item) chooseLanguage(item.dataset.language ?? "");
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeToTrigger();
        break;
      case "Tab":
        closeToTrigger();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          jumpToTypeAhead(event.key);
        }
        break;
    }
  });

  toolbar.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && toolbar.contains(next)) return;
    setOpen(false);
  });

  copy.addEventListener("click", () => {
    void writeCodeBlockClipboard(codeBlockClipboardText(node)).then((copied) => {
      copy.textContent = copied ? "Copied" : "Copy unavailable";
      if (copyReset !== null) window.clearTimeout(copyReset);
      copyReset = window.setTimeout(() => {
        copyReset = null;
        copy.textContent = "Copy";
      }, 1_500);
    });
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
      if (copyReset !== null) window.clearTimeout(copyReset);
      if (typeAheadReset !== null) window.clearTimeout(typeAheadReset);
    },
  };
}
