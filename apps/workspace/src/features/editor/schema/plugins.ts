import {
  baseKeymap,
  chainCommands,
  createParagraphNear,
  exitCode,
  liftEmptyBlock,
  newlineInCode,
  splitBlock,
  toggleMark,
} from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history, redo, undo } from "prosemirror-history";
import {
  ellipsis,
  emDash,
  smartQuotes,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { type EditorState, Plugin, TextSelection } from "prosemirror-state";
import { TableView, columnResizing, goToNextCell, tableEditing } from "prosemirror-tables";
import { Decoration, DecorationSet } from "prosemirror-view";
import { createAnnotationDecorationPlugin } from "../annotations/decorations";
import { moveSelectedBlock, selectBlockThenDocument } from "../blocks/commands";
import { createCodeHighlightPlugin } from "../code-blocks/highlight";
import {
  createMermaidPreviewSelectionPlugin,
  enterMermaidSource,
  exitMermaidSource,
} from "../code-blocks/nodeview";
import {
  createMathEditingPlugin,
  editSelectedInlineMath,
  enterAdjacentMathBlock,
  exitMathBlock,
  mathBlockFromDollarFence,
} from "../math/commands";
import { createSearchPlugin } from "../search/plugin";
import { createSuggestionPlugin } from "../suggestions/decorations";
import { createDueDateChipPlugin, dueDateInputRule } from "../tasks/due-date";
import { createRecurrenceChipPlugin, recurrenceInputRule } from "../tasks/recurrence";
import {
  createCheckboxTogglePlugin,
  splitTaskItem,
  taskInputRule,
  toggleCheckItemAtSelection,
} from "./check-items";
import { checkListInputRule } from "./check-list";
import { diagramInputRule, horizontalRuleInputRule, markInputRule } from "./input-rules";
import { autolinkInputRule, linkInputRule } from "./links";
import { productSchema } from "./product-schema";
import { createSlashMenuPlugin } from "./slash-menu";
import { createToggleListPlugin, toggleItemAtSelection, toggleListInputRule } from "./toggle-items";

const HISTORY_GROUP_DELAY_MS = 500;
const HISTORY_DEPTH = 200;

export function isDocEmpty(doc: ProseMirrorNode): boolean {
  return (
    doc.childCount === 1 &&
    doc.firstChild !== null &&
    doc.firstChild.type.name === "paragraph" &&
    doc.firstChild.childCount === 0
  );
}

function createPlaceholderPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const first = state.doc.firstChild;
        if (!first || !isDocEmpty(state.doc)) {
          return null;
        }
        return DecorationSet.create(state.doc, [
          Decoration.node(0, first.nodeSize, { class: "is-editor-empty" }),
        ]);
      },
    },
  });
}

/**
 * Enter inside ordinary prose adds a line break to the current paragraph rather
 * than starting a new one, so the note's Markdown gains one line per visible
 * line instead of a blank-line-separated block. Enter on the empty line that
 * follows a break trades that break for a real paragraph split, which keeps two
 * consecutive breaks — the one shape Markdown cannot round-trip cleanly — out of
 * the document. Structural blocks (lists, headings, code, tables) keep their own
 * Enter behavior and fall through to the base keymap.
 */
function breakOrSplitParagraph(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const hardBreak = productSchema.nodes.hard_break;
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !hardBreak) return false;
  const { $from, $to } = selection;
  if ($from.parent.type !== productSchema.nodes.paragraph || !$from.sameParent($to)) return false;
  const container = $from.node($from.depth - 1).type.name;
  if (container !== "doc" && container !== "blockquote") return false;

  const atParagraphEnd = $to.parentOffset === $to.parent.content.size;
  if (selection.empty && atParagraphEnd && $from.nodeBefore?.type === hardBreak) {
    if (dispatch) {
      const transaction = state.tr.delete($from.pos - 1, $from.pos);
      transaction.split($from.pos - 1);
      dispatch(transaction.scrollIntoView());
    }
    return true;
  }

  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  }
  return true;
}

function exitTerminalCodeBlockOnArrowDown(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if (
    !$from.parent.type.spec.code ||
    $from.parentOffset !== $from.parent.content.size ||
    $from.indexAfter(-1) !== $from.node(-1).childCount
  ) {
    return false;
  }
  return exitCode(state, dispatch);
}

const TABLE_DEFAULT_CELL_MIN_WIDTH = 100;

// columnResizing re-creates its table node view per state init, so every state swap redrew the editor.
function tableNodeViewPlugin(): Plugin {
  return new Plugin({
    props: {
      nodeViews: {
        table: (node) => new TableView(node, TABLE_DEFAULT_CELL_MIN_WIDTH),
      },
    },
  });
}

export function createProductPlugins(): Plugin[] {
  const blockquote = productSchema.nodes.blockquote;
  const codeBlock = productSchema.nodes.code_block;
  const heading = productSchema.nodes.heading;
  const bulletList = productSchema.nodes.bullet_list;
  const orderedList = productSchema.nodes.ordered_list;
  const listItem = productSchema.nodes.list_item;
  const checkItem = productSchema.nodes.check_item;
  const toggleItem = productSchema.nodes.toggle_item;
  const diagram = productSchema.nodes.diagram;
  if (
    !blockquote ||
    !codeBlock ||
    !heading ||
    !bulletList ||
    !orderedList ||
    !listItem ||
    !checkItem ||
    !toggleItem ||
    !diagram
  ) {
    throw new Error("product schema is missing a required block node");
  }
  const strong = productSchema.marks.strong;
  const em = productSchema.marks.em;
  const code = productSchema.marks.code;
  const strikethrough = productSchema.marks.strikethrough;
  const underline = productSchema.marks.underline;
  if (!strong || !em || !code || !strikethrough || !underline) {
    throw new Error("product schema is missing a required mark");
  }
  return [
    history({ newGroupDelay: HISTORY_GROUP_DELAY_MS, depth: HISTORY_DEPTH }),
    createSlashMenuPlugin(),
    createPlaceholderPlugin(),
    createSearchPlugin(),
    createAnnotationDecorationPlugin(),
    createSuggestionPlugin(),
    createCodeHighlightPlugin(),
    createMermaidPreviewSelectionPlugin(),
    createMathEditingPlugin(),
    createCheckboxTogglePlugin(),
    createDueDateChipPlugin(),
    createRecurrenceChipPlugin(),
    createToggleListPlugin(),
    inputRules({
      rules: [
        ...smartQuotes,
        ellipsis,
        emDash,
        taskInputRule(),
        checkListInputRule(),
        toggleListInputRule(),
        dueDateInputRule(),
        recurrenceInputRule(),
        textblockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
          level: match[1]?.length ?? 1,
        })),
        wrappingInputRule(/^\s*([-+*])\s$/, bulletList),
        wrappingInputRule(
          /^(\d+)\.\s$/,
          orderedList,
          (match) => ({ order: Number(match[1] ?? 1) }),
          (match, node) => node.childCount + Number(node.attrs.order) === Number(match[1]),
        ),
        wrappingInputRule(/^\s*>\s$/, blockquote),
        diagramInputRule(),
        textblockTypeInputRule(/^```$/, codeBlock),
        horizontalRuleInputRule(),
        linkInputRule(),
        autolinkInputRule(),
        markInputRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, strong, 2),
        markInputRule(/(?:^|[^_])__([^_\s](?:[^_]*[^_\s])?)__$/, strong, 2),
        markInputRule(/~~([^~\s](?:[^~]*[^~\s])?)~~$/, strikethrough, 2),
        markInputRule(/(?:^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, em, 1),
        markInputRule(/(?:^|[^\w])_([^_\s](?:[^_]*[^_\s])?)_$/, em, 1),
        markInputRule(/`([^`\s](?:[^`]*[^`\s])?)`$/, code, 1),
      ],
    }),
    keymap({
      "Mod-z": undo,
      "Shift-Mod-z": redo,
      "Mod-y": redo,
      "Mod-b": toggleMark(strong),
      "Mod-i": toggleMark(em),
      "Mod-e": toggleMark(code),
      "Mod-Shift-x": toggleMark(strikethrough),
      "Mod-u": toggleMark(underline),
      "Mod-a": selectBlockThenDocument(),
      "Alt-ArrowUp": moveSelectedBlock(-1),
      "Alt-ArrowDown": moveSelectedBlock(1),
      ArrowDown: chainCommands(enterAdjacentMathBlock("down"), exitTerminalCodeBlockOnArrowDown),
      ArrowUp: enterAdjacentMathBlock("up"),
      ArrowLeft: enterAdjacentMathBlock("left"),
      ArrowRight: enterAdjacentMathBlock("right"),
      "Alt-Enter": toggleItemAtSelection,
      "Alt-Shift-Enter": toggleCheckItemAtSelection,
      Escape: chainCommands(exitMermaidSource, exitMathBlock),
      Enter: chainCommands(
        enterMermaidSource,
        editSelectedInlineMath,
        mathBlockFromDollarFence,
        splitTaskItem(checkItem),
        splitListItem(toggleItem, { open: true }),
        splitListItem(listItem),
        breakOrSplitParagraph,
      ),
      "Shift-Enter": chainCommands(
        splitTaskItem(checkItem),
        splitListItem(toggleItem, { open: true }),
        splitListItem(listItem),
        newlineInCode,
        createParagraphNear,
        liftEmptyBlock,
        splitBlock,
      ),
      Tab: chainCommands(
        sinkListItem(checkItem),
        sinkListItem(toggleItem),
        sinkListItem(listItem),
        goToNextCell(1),
      ),
      "Shift-Tab": chainCommands(
        liftListItem(checkItem),
        liftListItem(toggleItem),
        liftListItem(listItem),
        goToNextCell(-1),
      ),
    }),
    keymap(baseKeymap),
    tableNodeViewPlugin(),
    columnResizing({ defaultCellMinWidth: TABLE_DEFAULT_CELL_MIN_WIDTH, View: null }),
    tableEditing(),
    dropCursor({ color: "hsl(var(--primary))", width: 2 }),
    gapCursor(),
  ];
}
