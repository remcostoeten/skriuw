import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import type { MarkType, NodeType } from "prosemirror-model";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HighlighterIcon,
  ItalicIcon,
  LinkIcon,
  MessageSquareIcon,
  PilcrowIcon,
  SparklesIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from "@/shared/icons/static";
import { LiquidMetalButton } from "./liquid-metal-button";
import { rangeMenuAnchor } from "./menu-anchor";
import {
  highlightColors,
  productSchema,
  type HighlightColor,
  type TextAlignment,
} from "./schema";

const BUBBLE_MENU_WIDTH = 340;

export type BubbleMenuState = {
  open: boolean;
  x: number;
  y: number;
  below: boolean;
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  highlightColor: HighlightColor | null;
  code: boolean;
  link: boolean;
  annotated: boolean;
  textAlign: TextAlignment;
  headingLevel: number | null;
  blockquote: boolean;
};

export const closedBubbleMenu: BubbleMenuState = {
  open: false,
  x: 0,
  y: 0,
  below: false,
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  highlightColor: null,
  code: false,
  link: false,
  annotated: false,
  textAlign: "left",
  headingLevel: null,
  blockquote: false,
};

export function bubbleMenuStateEqual(
  left: BubbleMenuState,
  right: BubbleMenuState,
): boolean {
  return (
    left.open === right.open &&
    left.x === right.x &&
    left.y === right.y &&
    left.below === right.below &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.strikethrough === right.strikethrough &&
    left.underline === right.underline &&
    left.highlightColor === right.highlightColor &&
    left.code === right.code &&
    left.link === right.link &&
    left.annotated === right.annotated &&
    left.textAlign === right.textAlign &&
    left.headingLevel === right.headingLevel &&
    left.blockquote === right.blockquote
  );
}

function requiredMark(name: string): MarkType {
  const mark = productSchema.marks[name];
  if (!mark) {
    throw new Error(`product schema is missing mark ${name}`);
  }
  return mark;
}

function requiredNode(name: string): NodeType {
  const node = productSchema.nodes[name];
  if (!node) {
    throw new Error(`product schema is missing node ${name}`);
  }
  return node;
}

function markActive(state: EditorState, markType: MarkType): boolean {
  const { from, to } = state.selection;
  return state.doc.rangeHasMark(from, to, markType);
}

function activeHighlightColor(state: EditorState): HighlightColor | null {
  const highlight = requiredMark("highlight");
  const { from, to } = state.selection;
  let color: HighlightColor | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true;
    const mark = highlight.isInSet(node.marks);
    const value = mark?.attrs.color;
    if (typeof value !== "string" || !(value in highlightColors)) {
      color = null;
      return false;
    }
    if (color !== null && color !== value) {
      color = null;
      return false;
    }
    color = value as HighlightColor;
    return true;
  });
  return color;
}

function insideBlockquote(state: EditorState): boolean {
  const blockquote = requiredNode("blockquote");
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === blockquote) return true;
  }
  return false;
}

export function computeBubbleMenu(view: EditorView): BubbleMenuState {
  const { state } = view;
  const { selection } = state;
  if (selection.empty || !(selection instanceof TextSelection)) {
    return closedBubbleMenu;
  }
  if (selection.$from.parent.type.spec.code) {
    return closedBubbleMenu;
  }
  const parent = selection.$from.parent;
  return {
    open: true,
    ...rangeMenuAnchor(view, selection.from, selection.to, BUBBLE_MENU_WIDTH),
    bold: markActive(state, requiredMark("strong")),
    italic: markActive(state, requiredMark("em")),
    strikethrough: markActive(state, requiredMark("strikethrough")),
    underline: markActive(state, requiredMark("underline")),
    highlightColor: activeHighlightColor(state),
    code: markActive(state, requiredMark("code")),
    link: markActive(state, requiredMark("link")),
    annotated: markActive(state, requiredMark("annotation")),
    textAlign: parent.attrs.textAlign === "center" || parent.attrs.textAlign === "right"
      ? parent.attrs.textAlign
      : "left",
    headingLevel: parent.type.name === "heading" ? Number(parent.attrs.level) : null,
    blockquote: insideBlockquote(state),
  };
}

function toggleHeading(level: number, active: boolean): Command {
  return active
    ? setBlockType(requiredNode("paragraph"))
    : setBlockType(requiredNode("heading"), { level });
}

function toggleBlockquote(active: boolean): Command {
  return active ? lift : wrapIn(requiredNode("blockquote"));
}

export function setTextAlignment(textAlign: TextAlignment): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const from = $from.before($from.depth);
    const to = $to.after($to.depth);
    const positions: number[] = [];
    state.doc.nodesBetween(from, to, (node, position) => {
      if (node.isTextblock && !node.type.spec.code && "textAlign" in node.attrs) {
        positions.push(position);
      }
      return true;
    });
    if (positions.length === 0) return false;
    if (!dispatch) return true;
    let transaction = state.tr;
    for (const position of positions) {
      const node = transaction.doc.nodeAt(position);
      if (node && node.attrs.textAlign !== textAlign) {
        transaction = transaction.setNodeMarkup(position, undefined, {
          ...node.attrs,
          textAlign,
        });
      }
    }
    if (transaction.docChanged) dispatch(transaction);
    return true;
  };
}

function highlightColorActive(state: EditorState, color: HighlightColor): boolean {
  if (state.selection.empty) {
    const mark = requiredMark("highlight").isInSet(
      state.storedMarks ?? state.selection.$from.marks(),
    );
    return mark?.attrs.color === color;
  }
  let sawText = false;
  let active = true;
  const highlight = requiredMark("highlight");
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (!node.isText || !node.text?.trim()) return true;
    sawText = true;
    if (highlight.isInSet(node.marks)?.attrs.color !== color) {
      active = false;
      return false;
    }
    return true;
  });
  return sawText && active;
}

export function setHighlightColor(color: HighlightColor): Command {
  return (state, dispatch) => {
    const highlight = requiredMark("highlight");
    if (!toggleMark(highlight)(state)) return false;
    const active = highlightColorActive(state, color);
    if (!dispatch) return true;
    if (state.selection.empty) {
      const transaction = active
        ? state.tr.removeStoredMark(highlight)
        : state.tr.addStoredMark(highlight.create({ color }));
      dispatch(transaction);
      return true;
    }
    const transaction = active
      ? state.tr.removeMark(state.selection.from, state.selection.to, highlight)
      : state.tr.addMark(
        state.selection.from,
        state.selection.to,
        highlight.create({ color }),
      );
    dispatch(transaction.scrollIntoView());
    return true;
  };
}

export function clearHighlight(): Command {
  return (state, dispatch) => {
    const highlight = requiredMark("highlight");
    if (!toggleMark(highlight)(state)) return false;
    if (!dispatch) return true;
    if (state.selection.empty) {
      dispatch(state.tr.removeStoredMark(highlight));
      return true;
    }
    dispatch(
      state.tr
        .removeMark(state.selection.from, state.selection.to, highlight)
        .scrollIntoView(),
    );
    return true;
  };
}

type BubbleAction = {
  id: string;
  label: string;
  active: boolean;
  content: ReactNode;
  command: Command;
  onPress?: () => void;
  /** Draws a rule above this row, separating it from the choices before it. */
  detached?: boolean;
};

/**
 * A toolbar entry: a control the writer presses, or a trigger that opens one
 * submenu of related choices. Only one choice in a submenu can be true of a
 * selection at a time, which is why they collapse well — the trigger shows the
 * one that is.
 */
type BubbleEntry = BubbleAction & {
  group: "ai" | "marks" | "blocks";
  menu?: readonly BubbleAction[];
};


const ALIGNMENT_ICONS = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
} as const;

const HEADING_ICONS = [Heading1Icon, Heading2Icon, Heading3Icon] as const;

const ALIGNMENT_LABELS = {
  left: "Align left",
  center: "Align center",
  right: "Align right",
} as const;

function blockTriggerContent(headingLevel: number | null, blockquote: boolean): ReactNode {
  if (headingLevel !== null) {
    const HeadingIcon = HEADING_ICONS[headingLevel - 1];
    return HeadingIcon === undefined ? `H${headingLevel}` : <HeadingIcon size={14} />;
  }
  if (blockquote) {
    return <TextQuoteIcon size={14} />;
  }
  return <PilcrowIcon size={14} />;
}

function highlightTriggerContent(color: HighlightColor | null): ReactNode {
  return (
    <span className="bubble-menu-swatch">
      <HighlighterIcon size={14} />
      <span
        className="bubble-menu-swatch-bar"
        style={color === null ? undefined : { background: highlightColors[color] }}
      />
    </span>
  );
}

function highlightActions(active: HighlightColor | null): BubbleAction[] {
  const colors = Object.entries(highlightColors).map(([color, backgroundColor]) => ({
    id: `highlight-${color}`,
    label: `Highlight ${color}`,
    active: active === color,
    content: (
      <span className="bubble-menu-dot" style={{ background: backgroundColor }} aria-hidden="true" />
    ),
    command: setHighlightColor(color as HighlightColor),
  }));
  return [
    ...colors,
    {
      id: "highlight-none",
      label: "No highlight",
      active: active === null,
      content: <span className="bubble-menu-choice-label">None</span>,
      command: clearHighlight(),
      detached: true,
    },
  ];
}

function alignmentActions(active: TextAlignment): BubbleAction[] {
  return (["left", "center", "right"] as const).map((textAlign) => {
    const Icon = ALIGNMENT_ICONS[textAlign];
    return {
      id: `align-${textAlign}`,
      label: ALIGNMENT_LABELS[textAlign],
      active: active === textAlign,
      content: <Icon size={14} />,
      command: setTextAlignment(textAlign),
    };
  });
}

function blockActions(headingLevel: number | null, blockquote: boolean): BubbleAction[] {
  return [
    {
      id: "paragraph",
      label: "Text",
      active: headingLevel === null && !blockquote,
      content: <PilcrowIcon size={14} />,
      command: setBlockType(requiredNode("paragraph")),
    },
    ...[1, 2, 3].map((level) => {
      const Icon = HEADING_ICONS[level - 1] ?? Heading1Icon;
      return {
        id: `heading-${level}`,
        label: `Heading ${level}`,
        active: headingLevel === level,
        content: <Icon size={14} />,
        command: toggleHeading(level, headingLevel === level),
      };
    }),
    {
      id: "blockquote",
      label: "Quote",
      active: blockquote,
      content: <TextQuoteIcon size={14} />,
      command: toggleBlockquote(blockquote),
      detached: true,
    },
  ];
}

/**
 * Builds the toolbar. Highlight, alignment, and block type each collapse into a
 * submenu: they are exclusive choices the writer makes rarely, and laid out flat
 * the thirteen of them buried bold and italic under a row of coloured dots.
 */
function bubbleEntries(state: BubbleMenuState, handlers: EntryHandlers): BubbleEntry[] {
  const entries: BubbleEntry[] = [
    {
      id: "bold",
      label: "Bold",
      active: state.bold,
      group: "marks",
      content: <BoldIcon size={14} />,
      command: toggleMark(requiredMark("strong")),
    },
    {
      id: "italic",
      label: "Italic",
      active: state.italic,
      group: "marks",
      content: <ItalicIcon size={14} />,
      command: toggleMark(requiredMark("em")),
    },
    {
      id: "strikethrough",
      label: "Strikethrough",
      active: state.strikethrough,
      group: "marks",
      content: <StrikethroughIcon size={14} />,
      command: toggleMark(requiredMark("strikethrough")),
    },
    {
      id: "underline",
      label: "Underline",
      active: state.underline,
      group: "marks",
      content: "U",
      command: toggleMark(requiredMark("underline")),
    },
    {
      id: "code",
      label: "Inline code",
      active: state.code,
      group: "marks",
      content: <CodeIcon size={14} />,
      command: toggleMark(requiredMark("code")),
    },
    {
      id: "link",
      label: "Link",
      active: state.link,
      group: "marks",
      content: <LinkIcon size={14} />,
      command: () => true,
      onPress: handlers.onLink,
    },
    {
      id: "comment",
      label: "Comment",
      active: state.annotated,
      group: "marks",
      content: <MessageSquareIcon size={14} />,
      command: () => true,
      onPress: handlers.onComment,
    },
    {
      id: "highlight",
      label: "Highlight",
      active: state.highlightColor !== null,
      group: "blocks",
      content: highlightTriggerContent(state.highlightColor),
      command: () => true,
      menu: highlightActions(state.highlightColor),
    },
    {
      id: "alignment",
      label: "Alignment",
      active: state.textAlign !== "left",
      group: "blocks",
      content: <AlignmentTriggerIcon textAlign={state.textAlign} />,
      command: () => true,
      menu: alignmentActions(state.textAlign),
    },
    {
      id: "block-type",
      label: "Block type",
      active: state.headingLevel !== null || state.blockquote,
      group: "blocks",
      content: blockTriggerContent(state.headingLevel, state.blockquote),
      command: () => true,
      menu: blockActions(state.headingLevel, state.blockquote),
    },
  ];
  // The AI entry leads the toolbar and carries its name. Buried at the end
  // behind an unlabelled icon it read as one more mark, and writers found AI
  // through the command palette or not at all.
  if (handlers.onAskAi !== null) {
    entries.unshift({
      id: "ask-ai",
      label: "Ask AI",
      active: false,
      group: "ai",
      content: (
        <>
          <SparklesIcon size={13} />
          <span>Ask AI</span>
        </>
      ),
      command: () => true,
      onPress: handlers.onAskAi,
    });
  }
  return entries;
}

function AlignmentTriggerIcon({ textAlign }: { textAlign: TextAlignment }) {
  const Icon = ALIGNMENT_ICONS[textAlign];
  return <Icon size={14} />;
}

type EntryHandlers = {
  onLink: () => void;
  onComment: () => void;
  onAskAi: (() => void) | null;
};

type Props = {
  state: BubbleMenuState;
  getView: () => EditorView | null;
  onLink: () => void;
  onComment: () => void;
  /** Null keeps the AI entry out of the toolbar entirely while AI is opted out. */
  onAskAi: (() => void) | null;
  onDismiss: () => void;
  onCancel: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function BubbleMenu({
  state,
  getView,
  onLink,
  onComment,
  onAskAi,
  onDismiss,
  onCancel,
  containerRef,
}: Props) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!state.open) {
      setFocusIndex(0);
      setOpenMenuId(null);
    }
  }, [state.open]);

  // A submenu belongs to the range the toolbar was opened over; once the
  // toolbar moves it is over different text and the open choices are stale.
  useEffect(() => {
    setOpenMenuId(null);
  }, [state.x, state.y]);

  if (!state.open) return null;

  const entries = bubbleEntries(state, { onLink, onComment, onAskAi });

  function moveFocus(next: number): void {
    const wrapped = (next + entries.length) % entries.length;
    setFocusIndex(wrapped);
    setOpenMenuId(null);
    buttonsRef.current[wrapped]?.focus();
  }

  function activate(action: BubbleAction, returnFocus: boolean): void {
    if (action.onPress) {
      action.onPress();
      return;
    }
    const view = getView();
    if (!view) return;
    action.command(view.state, view.dispatch);
    if (returnFocus) view.focus();
  }

  function pressEntry(entry: BubbleEntry, index: number, returnFocus: boolean): void {
    if (entry.menu !== undefined) {
      setFocusIndex(index);
      setOpenMenuId((open) => (open === entry.id ? null : entry.id));
      return;
    }
    setOpenMenuId(null);
    activate(entry, returnFocus);
  }

  function closeSubmenu(index: number): void {
    setOpenMenuId(null);
    buttonsRef.current[index]?.focus();
  }

  return (
    <div
      ref={containerRef}
      className="bubble-menu"
      role="toolbar"
      aria-label="Text formatting"
      aria-orientation="horizontal"
      data-below={state.below ? "true" : undefined}
      style={{ left: state.x, top: state.y }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          next instanceof HTMLElement &&
          (next.closest(".bubble-menu") || next.closest(".prosemirror-host"))
        ) {
          return;
        }
        onDismiss();
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          moveFocus(focusIndex + (event.shiftKey ? -1 : 1));
        } else if (event.key === "ArrowRight") {
          // 60% keyboards have no Home or End, so shift+arrow jumps to either
          // end of the toolbar; Home and End still work where they exist.
          event.preventDefault();
          moveFocus(event.shiftKey ? entries.length - 1 : focusIndex + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveFocus(event.shiftKey ? 0 : focusIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          moveFocus(0);
        } else if (event.key === "End") {
          event.preventDefault();
          moveFocus(entries.length - 1);
        } else if (event.key === "ArrowDown" && entries[focusIndex]?.menu !== undefined) {
          event.preventDefault();
          setOpenMenuId(entries[focusIndex]?.id ?? null);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {entries.map((entry, index) => (
        <span key={entry.id} className="bubble-menu-group">
          {index > 0 && entry.group !== entries[index - 1]?.group && (
            <span className="bubble-menu-sep" />
          )}
          {entry.group === "ai" && entry.menu === undefined ? (
            <LiquidMetalButton
              label={entry.label}
              tabIndex={index === focusIndex ? 0 : -1}
              onRef={(element) => {
                buttonsRef.current[index] = element;
              }}
              onFocus={() => setFocusIndex(index)}
              onPress={() => pressEntry(entry, index, false)}
            >
              {entry.content}
            </LiquidMetalButton>
          ) : (
          <button
            ref={(element) => {
              buttonsRef.current[index] = element;
            }}
            type="button"
            title={entry.label}
            aria-label={entry.label}
            {...(entry.menu === undefined
              ? { "aria-pressed": entry.active }
              : { "aria-haspopup": "true" as const, "aria-expanded": openMenuId === entry.id })}
            tabIndex={index === focusIndex ? 0 : -1}
            className={entry.active ? "is-active" : ""}
            onFocus={() => setFocusIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              pressEntry(entry, index, event.detail !== 0);
            }}
          >
            {entry.content}
            {entry.menu !== undefined && (
              <ChevronDownIcon size={9} className="bubble-menu-caret" aria-hidden="true" />
            )}
          </button>
          )}
          {entry.menu !== undefined && openMenuId === entry.id && (
            <BubbleSubmenu
              label={entry.label}
              actions={entry.menu}
              onActivate={(action, returnFocus) => {
                activate(action, returnFocus);
                closeSubmenu(index);
              }}
              onClose={() => closeSubmenu(index)}
            />
          )}
        </span>
      ))}
    </div>
  );
}

type SubmenuProps = {
  label: string;
  actions: readonly BubbleAction[];
  onActivate: (action: BubbleAction, returnFocus: boolean) => void;
  onClose: () => void;
};

/**
 * The choices behind one trigger. It keeps its own arrow-key focus and swallows
 * the keys the toolbar handles, so navigating a submenu never moves the
 * toolbar's own position underneath it.
 */
function BubbleSubmenu({ label, actions, onActivate, onClose }: SubmenuProps) {
  const [initialIndex] = useState(() =>
    Math.max(
      actions.findIndex((action) => action.active),
      0,
    ),
  );
  const [focusIndex, setFocusIndex] = useState(initialIndex);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  function moveFocus(next: number): void {
    const wrapped = (next + actions.length) % actions.length;
    setFocusIndex(wrapped);
    buttonsRef.current[wrapped]?.focus();
  }

  return (
    <div
      className="bubble-submenu"
      role="menu"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          moveFocus(focusIndex + 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          moveFocus(focusIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          event.stopPropagation();
          moveFocus(0);
        } else if (event.key === "End") {
          event.preventDefault();
          event.stopPropagation();
          moveFocus(actions.length - 1);
        }
      }}
    >
      {actions.map((action, index) => (
        <span key={action.id} className="bubble-submenu-row">
          {action.detached === true && <span className="bubble-submenu-sep" />}
          <button
            ref={(element) => {
              buttonsRef.current[index] = element;
            }}
            type="button"
            role="menuitemradio"
            aria-checked={action.active}
            aria-label={action.label}
            title={action.label}
            autoFocus={index === initialIndex}
            tabIndex={index === focusIndex ? 0 : -1}
            className={action.active ? "is-active" : ""}
            onFocus={() => setFocusIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              onActivate(action, event.detail !== 0);
            }}
          >
            {action.content}
          </button>
        </span>
      ))}
    </div>
  );
}
