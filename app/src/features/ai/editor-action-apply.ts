import { Fragment, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { markdownPasteSlice } from "@/features/editor/markdown-paste";
import { taskCheckItemAttrs } from "@/features/editor/task-promotion";
import { productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import type { AiPlanItem } from "./action-plan";
import type { AiActionScope } from "./editor-actions";
import { applyRefusal, type AiActionTarget } from "./editor-action-model";

const NO_IMAGES: ReadonlySet<string> = new Set();

/**
 * The plain text an action sends. Selections travel as the text the writer can
 * see highlighted rather than a serialised slice, so the preview shown before a
 * request leaves the device is character-for-character the payload.
 */
export function actionInputText(state: EditorState, scope: AiActionScope): string {
  if (scope === "selection") {
    const { from, to } = state.selection;
    return state.doc.textBetween(from, to, "\n\n", "\n");
  }
  if (scope === "caret") {
    return state.doc.textBetween(0, state.selection.from, "\n\n", "\n");
  }
  return serializeProductMarkdown(state.doc);
}

/** The range an action's result would replace, matching {@link actionInputText}. */
export function actionInputRange(
  state: EditorState,
  scope: AiActionScope,
): { from: number; to: number } {
  if (scope === "selection") {
    return { from: state.selection.from, to: state.selection.to };
  }
  if (scope === "caret") {
    return { from: state.selection.from, to: state.selection.from };
  }
  return { from: 0, to: state.doc.content.size };
}

/**
 * Re-reads the captured range from the live document. Null once the range no
 * longer fits the document, which is how a result that outlived its note is
 * caught before it can be applied.
 */
export function currentInputText(
  state: EditorState,
  target: AiActionTarget,
  scope: AiActionScope,
): string | null {
  if (scope === "note") {
    return serializeProductMarkdown(state.doc);
  }
  const size = state.doc.content.size;
  if (target.from < 0 || target.to > size || target.from > target.to) {
    return null;
  }
  const from = scope === "caret" ? 0 : target.from;
  return state.doc.textBetween(from, target.to, "\n\n", "\n");
}

/**
 * Why a result may not touch this editor state, or null when it may. Every
 * surface that offers a result asks the same question in the same place, so a
 * run that outlived its range is refused identically wherever it was reviewed.
 */
export function liveEditorRefusal(
  state: EditorState,
  target: AiActionTarget,
  scope: AiActionScope,
  currentNoteId: string | null,
): string | null {
  return applyRefusal(target, currentNoteId, currentInputText(state, target, scope));
}

function resultSlice(state: EditorState, text: string): Slice {
  const markdown = markdownPasteSlice(state, text, NO_IMAGES);
  if (markdown !== null) {
    return markdown;
  }
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) =>
      productSchema.node(
        "paragraph",
        null,
        block.length === 0 ? undefined : productSchema.text(block.replace(/\n/g, " ")),
      ),
    );
  return new Slice(Fragment.from(paragraphs), 1, 1);
}

/**
 * Accepting is exactly one transaction. Everything the writer reviewed lands
 * together, so a single undo puts the note back the way it was.
 */
export function replaceRangeTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction {
  return state.tr.replaceRange(from, to, resultSlice(state, text)).scrollIntoView();
}

function blockEndAfter(state: EditorState, position: number): number {
  const resolved = state.doc.resolve(Math.min(position, state.doc.content.size));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).isTextblock) {
      return resolved.after(depth);
    }
  }
  return state.doc.content.size;
}

export function insertBelowTransaction(
  state: EditorState,
  position: number,
  text: string,
): Transaction {
  const at = blockEndAfter(state, position);
  return state.tr.replace(at, at, resultSlice(state, text)).scrollIntoView();
}

function checkItem(title: string): ProseMirrorNode {
  return productSchema.node("check_item", taskCheckItemAttrs(), [
    productSchema.node("paragraph", null, productSchema.text(title)),
  ]);
}

/**
 * Appends confirmed tasks as an ordinary checklist carrying fresh task and
 * block identities. From there the note's normal promotion path owns them, so
 * an extracted task is the same kind of task a writer types by hand.
 */
export function appendTaskPlanTransaction(
  state: EditorState,
  items: readonly AiPlanItem[],
): Transaction | null {
  if (items.length === 0) {
    return null;
  }
  const list = productSchema.node(
    "check_list",
    null,
    items.map((item) => checkItem(item.text)),
  );
  const at = state.doc.content.size;
  return state.tr.insert(at, list).scrollIntoView();
}

export type AiTagReference = {
  id: string;
  name: string;
};

/**
 * Appends confirmed tags as ordinary reference chips in a trailing paragraph.
 * The tag records themselves are created through the reference operations, not
 * here — this only writes the document half of the same change.
 */
export function appendTagPlanTransaction(
  state: EditorState,
  references: readonly AiTagReference[],
): Transaction | null {
  const tagRef = productSchema.nodes.tag_ref;
  if (tagRef === undefined || references.length === 0) {
    return null;
  }
  const content: ProseMirrorNode[] = [];
  for (const [index, reference] of references.entries()) {
    if (index > 0) {
      content.push(productSchema.text(" "));
    }
    content.push(tagRef.create({ id: reference.id, label: reference.name }));
  }
  const at = state.doc.content.size;
  return state.tr
    .insert(at, productSchema.node("paragraph", null, content))
    .scrollIntoView();
}
