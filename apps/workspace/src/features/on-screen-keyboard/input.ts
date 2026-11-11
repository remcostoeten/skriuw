import type { Stroke } from "./press";

export type MoveDirection = "left" | "right" | "backward" | "forward";

export type MoveGranularity = "character" | "word" | "line" | "lineboundary" | "documentboundary";

export type DefaultAction =
  | { type: "insert"; text: string }
  | { type: "delete"; direction: "backward" | "forward"; granularity: "character" | "word" }
  | { type: "paragraph" }
  | { type: "selectAll" }
  | { type: "move"; direction: MoveDirection; granularity: MoveGranularity; extend: boolean }
  | { type: "page"; direction: -1 | 1; extend: boolean };

type ModifiableSelection = Selection & {
  modify: (alter: string, direction: string, granularity: string) => void;
};

type TextField = HTMLInputElement | HTMLTextAreaElement;

const EDITOR_SELECTOR = ".editor-pane .ProseMirror, .editor-pane .cm-content";

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

const SCROLL_STEP = 48;

const LINE_HEIGHT = 24;

function moveAction(
  direction: MoveDirection,
  granularity: MoveGranularity,
  extend: boolean,
): DefaultAction {
  return { type: "move", direction, granularity, extend };
}

/**
 * @name defaultAction
 * @description What the browser would have done with a key press that no
 * editor binding handled: type a character, delete, break a paragraph, or move
 * the caret. A key with no default returns null.
 *
 * @example
 * const action = defaultAction(stroke);
 * if (action) apply(action);
 */
export function defaultAction(stroke: Stroke): DefaultAction | null {
  if (stroke.text !== null) {
    return { type: "insert", text: stroke.text };
  }
  if (stroke.altKey || stroke.metaKey) {
    return null;
  }
  const word = stroke.ctrlKey;
  const extend = stroke.shiftKey;
  if (word && !extend && stroke.key.toLowerCase() === "a") {
    return { type: "selectAll" };
  }
  switch (stroke.key) {
    case "Backspace":
      return {
        type: "delete",
        direction: "backward",
        granularity: word ? "word" : "character",
      };
    case "Delete":
      return {
        type: "delete",
        direction: "forward",
        granularity: word ? "word" : "character",
      };
    case "Enter":
      return word ? null : { type: "paragraph" };
    case "ArrowLeft":
      return moveAction("left", word ? "word" : "character", extend);
    case "ArrowRight":
      return moveAction("right", word ? "word" : "character", extend);
    case "ArrowUp":
      return moveAction("backward", "line", extend);
    case "ArrowDown":
      return moveAction("forward", "line", extend);
    case "Home":
      return moveAction("backward", word ? "documentboundary" : "lineboundary", extend);
    case "End":
      return moveAction("forward", word ? "documentboundary" : "lineboundary", extend);
    case "PageUp":
      return { type: "page", direction: -1, extend };
    case "PageDown":
      return { type: "page", direction: 1, extend };
    default:
      return null;
  }
}

function lineStart(text: string, index: number): number {
  return index <= 0 ? 0 : text.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(text: string, index: number): number {
  const found = text.indexOf("\n", index);
  return found === -1 ? text.length : found;
}

function previousWord(text: string, index: number): number {
  let cursor = index;
  while (cursor > 0 && /\s/.test(text.charAt(cursor - 1))) {
    cursor -= 1;
  }
  while (cursor > 0 && !/\s/.test(text.charAt(cursor - 1))) {
    cursor -= 1;
  }
  return cursor;
}

function nextWord(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text.charAt(cursor))) {
    cursor += 1;
  }
  while (cursor < text.length && !/\s/.test(text.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function verticalCaret(text: string, index: number, direction: MoveDirection): number {
  const start = lineStart(text, index);
  const column = index - start;
  if (direction === "backward") {
    if (start === 0) {
      return 0;
    }
    const previous = lineStart(text, start - 1);
    return Math.min(previous + column, start - 1);
  }
  const end = lineEnd(text, index);
  if (end >= text.length) {
    return text.length;
  }
  return Math.min(end + 1 + column, lineEnd(text, end + 1));
}

/**
 * @name movedCaret
 * @description Where a caret lands after a move inside plain text, for inputs
 * and textareas that have no editor of their own.
 *
 * @example
 * movedCaret("one two", 7, "left", "word"); // 4
 */
export function movedCaret(
  text: string,
  index: number,
  direction: MoveDirection,
  granularity: MoveGranularity,
): number {
  const forward = direction === "right" || direction === "forward";
  switch (granularity) {
    case "character":
      return Math.max(0, Math.min(text.length, index + (forward ? 1 : -1)));
    case "word":
      return forward ? nextWord(text, index) : previousWord(text, index);
    case "lineboundary":
      return forward ? lineEnd(text, index) : lineStart(text, index);
    case "documentboundary":
      return forward ? text.length : 0;
    case "line":
      return verticalCaret(text, index, direction);
  }
}

function isModifiable(selection: Selection): selection is ModifiableSelection {
  return "modify" in selection;
}

function isTextField(element: HTMLElement): element is TextField {
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA";
}

/**
 * @name isEditableElement
 * @description Whether an element accepts typed text: a rich-text host or an
 * enabled, writable text input or textarea.
 *
 * @example
 * if (isEditableElement(event.target)) remember(event.target);
 */
export function isEditableElement(element: EventTarget | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.tagName === "TEXTAREA") {
    return !element.hasAttribute("disabled") && !element.hasAttribute("readonly");
  }
  if (element.tagName === "INPUT") {
    const type = element.getAttribute("type") ?? "text";
    return (
      TEXT_INPUT_TYPES.has(type) &&
      !element.hasAttribute("disabled") &&
      !element.hasAttribute("readonly")
    );
  }
  return element.isContentEditable;
}

/**
 * @name findEditable
 * @description Picks where on-screen keys should type: the last field the
 * user focused while it is still on screen, otherwise the open note's editor.
 *
 * @example
 * const target = findEditable(document, lastFocusedField);
 */
export function findEditable(doc: Document, remembered: HTMLElement | null): HTMLElement | null {
  if (remembered && remembered.isConnected && remembered.getClientRects().length > 0) {
    return remembered;
  }
  return doc.querySelector<HTMLElement>(EDITOR_SELECTOR);
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  let current: HTMLElement | null = element.parentElement;
  while (current && view) {
    const overflow = view.getComputedStyle(current).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * @name scrollEditable
 * @description Scrolls the pane holding a field by one step without moving the
 * caret, for Scroll Lock.
 *
 * @example
 * scrollEditable(target, 1);
 */
export function scrollEditable(target: HTMLElement, direction: -1 | 1): void {
  const scroller = scrollParent(target);
  if (scroller) {
    scroller.scrollTop += direction * SCROLL_STEP;
  }
}

function replaceFieldRange(field: TextField, start: number, end: number, text: string): void {
  field.setRangeText(text, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function fieldFocus(field: TextField, start: number, end: number): number {
  return field.selectionDirection === "backward" ? start : end;
}

function applyMoveToField(field: TextField, action: DefaultAction & { type: "move" }): void {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  if (!action.extend && start !== end && action.granularity === "character") {
    const caret = action.direction === "left" ? start : end;
    field.setSelectionRange(caret, caret);
    return;
  }
  const focus = fieldFocus(field, start, end);
  const anchor = focus === start ? end : start;
  const next = movedCaret(field.value, focus, action.direction, action.granularity);
  if (!action.extend) {
    field.setSelectionRange(next, next);
    return;
  }
  field.setSelectionRange(
    Math.min(anchor, next),
    Math.max(anchor, next),
    next < anchor ? "backward" : "forward",
  );
}

function applyToField(field: TextField, action: DefaultAction): void {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  switch (action.type) {
    case "insert":
      replaceFieldRange(field, start, end, action.text);
      return;
    case "paragraph":
      if (field.tagName === "TEXTAREA") {
        replaceFieldRange(field, start, end, "\n");
      }
      return;
    case "delete": {
      if (start !== end) {
        replaceFieldRange(field, start, end, "");
        return;
      }
      const backward = action.direction === "backward";
      const edge = movedCaret(field.value, start, backward ? "left" : "right", action.granularity);
      replaceFieldRange(field, Math.min(start, edge), Math.max(start, edge), "");
      return;
    }
    case "selectAll":
      field.select();
      return;
    case "move":
      applyMoveToField(field, action);
      return;
    case "page": {
      const next = action.direction === -1 ? 0 : field.value.length;
      field.setSelectionRange(next, next);
      return;
    }
  }
}

function pageLines(target: HTMLElement): number {
  const scroller = scrollParent(target);
  const height = scroller ? scroller.clientHeight : target.clientHeight;
  return Math.max(1, Math.floor(height / LINE_HEIGHT) - 1);
}

function applyToEditable(target: HTMLElement, action: DefaultAction): void {
  const doc = target.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  const modifiable = selection && isModifiable(selection) ? selection : null;
  // execCommand is the only way to type into a contenteditable through the editor's own input handling.
  switch (action.type) {
    case "insert":
      doc.execCommand("insertText", false, action.text);
      return;
    case "paragraph":
      doc.execCommand("insertParagraph");
      return;
    case "selectAll":
      doc.execCommand("selectAll");
      return;
    case "delete":
      if (action.granularity === "word") {
        modifiable?.modify("extend", action.direction, "word");
      }
      doc.execCommand(action.direction === "backward" ? "delete" : "forwardDelete");
      return;
    case "move":
      modifiable?.modify(action.extend ? "extend" : "move", action.direction, action.granularity);
      return;
    case "page": {
      const lines = pageLines(target);
      const direction = action.direction === -1 ? "backward" : "forward";
      for (let line = 0; line < lines; line += 1) {
        modifiable?.modify(action.extend ? "extend" : "move", direction, "line");
      }
      return;
    }
  }
}

/**
 * @name deliverStroke
 * @description Sends a key press to an editable element the way a physical key
 * would arrive: a keydown the editor's keymaps and the app's shortcuts can
 * handle, then the browser default when nothing did, then a keyup. Editors
 * such as ProseMirror and CodeMirror therefore see the same input as from
 * hardware, including Vim motions and input rules.
 *
 * @example
 * deliverStroke(editorElement, stroke);
 */
export function deliverStroke(target: HTMLElement, stroke: Stroke): void {
  const view = target.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const init: KeyboardEventInit = {
    key: stroke.key,
    code: stroke.code,
    keyCode: stroke.keyCode,
    which: stroke.keyCode,
    shiftKey: stroke.shiftKey,
    ctrlKey: stroke.ctrlKey,
    altKey: stroke.altKey,
    metaKey: stroke.metaKey,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
  const keydown = new view.KeyboardEvent("keydown", init);
  target.dispatchEvent(keydown);
  if (!keydown.defaultPrevented) {
    const action = defaultAction(stroke);
    if (action) {
      if (isTextField(target)) {
        applyToField(target, action);
      } else {
        applyToEditable(target, action);
      }
    }
  }
  target.dispatchEvent(new view.KeyboardEvent("keyup", init));
}
