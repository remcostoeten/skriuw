import type { Node as ProseMirrorNode, ResolvedPos } from "prosemirror-model";
import {
  NodeSelection,
  Plugin,
  Selection,
  TextSelection,
  type Command,
  type EditorState,
} from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export const MATH_EDIT_EVENT = "skriuw-math-edit";

export const MATH_EDITING_CLASS = "is-editing";

export type MathArrowDirection = "left" | "right" | "up" | "down";

function findInsertedNode(doc: ProseMirrorNode, target: ProseMirrorNode): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node === target) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function inMathBlock($pos: ResolvedPos): boolean {
  return $pos.parent.type.name === "math_block";
}

/**
 * @name requestInlineMathEdit
 * @description Opens the popover editor of the inline math node at `pos`. The
 * node view owns the popover, so the request travels as a DOM event on the
 * node's element.
 *
 * @example
 * requestInlineMathEdit(view, selection.from);
 */
export function requestInlineMathEdit(view: EditorView | undefined, pos: number): boolean {
  if (!view || typeof view.nodeDOM !== "function") return false;
  const dom = view.nodeDOM(pos);
  if (!dom || typeof (dom as HTMLElement).dispatchEvent !== "function") return false;
  (dom as HTMLElement).dispatchEvent(new CustomEvent(MATH_EDIT_EVENT));
  return true;
}

/**
 * @name insertMathBlock
 * @description Inserts a display math block at the selection and puts the
 * caret in its source. Selected text becomes the TeX, and an empty paragraph is
 * replaced rather than split.
 *
 * @example
 * insertMathBlock(view.state, view.dispatch, view);
 */
export const insertMathBlock: Command = (state, dispatch) => {
  const mathBlock = state.schema.nodes.math_block;
  const { $from, $to, empty } = state.selection;
  if (!mathBlock || $from.parent.type.spec.code) return false;
  if (!dispatch) return true;
  const tex = empty ? "" : state.doc.textBetween($from.pos, $to.pos, "\n", " ");
  const node = mathBlock.create(null, tex ? state.schema.text(tex) : undefined);
  const replacesParagraph =
    empty && $from.parent.isTextblock && $from.parent.content.size === 0 && $from.depth > 0;
  const transaction = replacesParagraph
    ? state.tr.replaceWith($from.before(), $from.after(), node)
    : state.tr.replaceSelectionWith(node);
  const insertedAt = findInsertedNode(transaction.doc, node);
  if (insertedAt !== null) {
    transaction.setSelection(TextSelection.create(transaction.doc, insertedAt + 1 + tex.length));
  }
  dispatch(transaction.scrollIntoView());
  return true;
};

/**
 * @name insertInlineMath
 * @description Turns the selected text into inline math, or inserts an empty
 * inline math node and opens its editor when nothing is selected. On a selected
 * inline math node it opens that node's editor.
 *
 * @example
 * insertInlineMath(view.state, view.dispatch, view);
 */
export const insertInlineMath: Command = (state, dispatch, view) => {
  const mathInline = state.schema.nodes.math_inline;
  const { selection } = state;
  if (!mathInline) return false;
  if (selection instanceof NodeSelection && selection.node.type === mathInline) {
    return editSelectedInlineMath(state, dispatch, view);
  }
  const { $from, $to, empty } = selection;
  if (!$from.parent.inlineContent || $from.parent.type.spec.code || !$from.sameParent($to)) {
    return false;
  }
  if (!$from.parent.canReplaceWith($from.index(), $to.index(), mathInline)) return false;
  if (!dispatch) return true;
  const tex = empty ? "" : state.doc.textBetween($from.pos, $to.pos, " ", " ").trim();
  const node = mathInline.create({ tex });
  const transaction = state.tr.replaceWith($from.pos, $to.pos, node);
  transaction.setSelection(NodeSelection.create(transaction.doc, $from.pos));
  dispatch(transaction.scrollIntoView());
  if (!tex) requestInlineMathEdit(view, $from.pos);
  return true;
};

/**
 * @name editSelectedInlineMath
 * @description Enter on a selected inline math node opens its popover editor.
 *
 * @example
 * chainCommands(editSelectedInlineMath, splitBlock);
 */
export const editSelectedInlineMath: Command = (state, dispatch, view) => {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "math_inline") {
    return false;
  }
  if (dispatch) requestInlineMathEdit(view, selection.from);
  return true;
};

/**
 * @name mathBlockFromDollarFence
 * @description Enter on a line holding only `$$` turns that line into a math
 * block. The `$` people trigger never fires here, because a second `$` closes
 * the mention menu before Enter is pressed.
 *
 * @example
 * chainCommands(mathBlockFromDollarFence, splitBlock);
 */
export const mathBlockFromDollarFence: Command = (state, dispatch) => {
  const mathBlock = state.schema.nodes.math_block;
  const hardBreak = state.schema.nodes.hard_break;
  const { selection } = state;
  if (!mathBlock || !(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  const paragraph = $from.parent;
  if (paragraph.type.name !== "paragraph" || $from.parentOffset !== paragraph.content.size) {
    return false;
  }
  let lineStart = 0;
  paragraph.forEach((child, offset) => {
    if (child.type === hardBreak) lineStart = offset + child.nodeSize;
  });
  const line = paragraph.textBetween(lineStart, paragraph.content.size, "\0", "\0");
  if (line.trim() !== "$$") return false;
  if (!dispatch) return true;
  const node = mathBlock.create();
  const paragraphStart = $from.start();
  const transaction = state.tr;
  if (lineStart === 0) {
    transaction.replaceWith($from.before(), $from.after(), node);
    transaction.setSelection(TextSelection.create(transaction.doc, $from.before() + 1));
  } else {
    const afterParagraph = $from.after();
    transaction.insert(afterParagraph, node);
    transaction.delete(paragraphStart + lineStart - 1, $from.pos);
    const blockStart = transaction.mapping.map(afterParagraph, -1);
    transaction.setSelection(TextSelection.create(transaction.doc, blockStart + 1));
  }
  dispatch(transaction.scrollIntoView());
  return true;
};

function atTextblockEdge(
  state: EditorState,
  direction: MathArrowDirection,
  view: EditorView | undefined,
): boolean {
  const { $head } = state.selection;
  if (direction === "right") return $head.parentOffset === $head.parent.content.size;
  if (direction === "left") return $head.parentOffset === 0;
  return view !== undefined && view.endOfTextblock(direction);
}

/**
 * @name enterAdjacentMathBlock
 * @description Moves the caret from the edge of a textblock into the source
 * of the math block next to it. The source is collapsed while the block shows
 * its rendering, so the browser's own caret movement would skip over it.
 *
 * @example
 * keymap({ ArrowDown: enterAdjacentMathBlock("down") });
 */
export function enterAdjacentMathBlock(direction: MathArrowDirection): Command {
  return (state, dispatch, view) => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    const { $head } = selection;
    if (!$head.parent.isTextblock || $head.depth === 0) return false;
    if (!atTextblockEdge(state, direction, view)) return false;
    const forward = direction === "right" || direction === "down";
    const boundary = state.doc.resolve(forward ? $head.after() : $head.before());
    const target = Selection.findFrom(boundary, forward ? 1 : -1, true);
    if (!target || !inMathBlock(target.$from)) return false;
    if (dispatch) {
      const pos = forward ? target.$from.start() : target.$from.end();
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
    }
    return true;
  };
}

/**
 * @name exitMathBlock
 * @description Escape in a math block's source returns the caret to the text
 * after the block, adding an empty paragraph when the block ends the document.
 *
 * @example
 * keymap({ Escape: exitMathBlock });
 */
export const exitMathBlock: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if (!inMathBlock($from)) return false;
  if (!dispatch) return true;
  const after = $from.after();
  const next = Selection.findFrom(state.doc.resolve(after), 1, true);
  if (next && next.from >= after) {
    dispatch(state.tr.setSelection(next).scrollIntoView());
    return true;
  }
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return true;
  const transaction = state.tr.insert(after, paragraph.create());
  transaction.setSelection(TextSelection.create(transaction.doc, after + 1));
  dispatch(transaction.scrollIntoView());
  return true;
};

/**
 * @name createMathEditingPlugin
 * @description Marks the math block that holds the caret so it shows its
 * source above the rendering; every other block shows only the rendering.
 *
 * @example
 * plugins.push(createMathEditingPlugin());
 */
export function createMathEditingPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { $from, $to } = state.selection;
        if (!inMathBlock($from) || !$from.sameParent($to)) return null;
        const start = $from.before();
        return DecorationSet.create(state.doc, [
          Decoration.node(start, start + $from.parent.nodeSize, { class: MATH_EDITING_CLASS }),
        ]);
      },
    },
  });
}
