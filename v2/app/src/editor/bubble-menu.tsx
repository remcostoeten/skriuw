import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import type { MarkType, NodeType } from "prosemirror-model";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from "@/shared/icons";
import { rangeMenuAnchor } from "./menu-anchor";
import {
  highlightColors,
  productSchema,
  type HighlightColor,
  type TextAlignment,
} from "./schema";

const BUBBLE_MENU_WIDTH = 560;

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

type BubbleButton = {
  id: string;
  label: string;
  active: boolean;
  group: "marks" | "highlight" | "alignment" | "blocks";
  content: ReactNode;
  command: Command;
  onPress?: () => void;
};

type Props = {
  state: BubbleMenuState;
  getView: () => EditorView | null;
  onLink: () => void;
  onDismiss: () => void;
  onCancel: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function BubbleMenu({
  state,
  getView,
  onLink,
  onDismiss,
  onCancel,
  containerRef,
}: Props) {
  const [focusIndex, setFocusIndex] = useState(0);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!state.open) setFocusIndex(0);
  }, [state.open]);

  if (!state.open) return null;
  const buttons: BubbleButton[] = [
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
      onPress: onLink,
    },
    ...Object.entries(highlightColors).map(([color, backgroundColor]) => ({
      id: `highlight-${color}`,
      label: `Highlight ${color}`,
      active: state.highlightColor === color,
      group: "highlight" as const,
      content: <span aria-hidden="true" style={{ color: backgroundColor }}>●</span>,
      command: setHighlightColor(color as HighlightColor),
    })),
    ...(["left", "center", "right"] as const).map((textAlign) => ({
      id: `align-${textAlign}`,
      label: `Align ${textAlign}`,
      active: state.textAlign === textAlign,
      group: "alignment" as const,
      content: textAlign === "left" ? "≡" : textAlign === "center" ? "≣" : "☷",
      command: setTextAlignment(textAlign),
    })),
    ...[1, 2, 3].map((level) => ({
      id: `heading-${level}`,
      label: `Heading ${level}`,
      active: state.headingLevel === level,
      group: "blocks" as const,
      content: `H${level}` as ReactNode,
      command: toggleHeading(level, state.headingLevel === level),
    })),
    {
      id: "blockquote",
      label: "Quote",
      active: state.blockquote,
      group: "blocks",
      content: <TextQuoteIcon size={14} />,
      command: toggleBlockquote(state.blockquote),
    },
  ];
  function moveFocus(next: number): void {
    const wrapped = (next + buttons.length) % buttons.length;
    setFocusIndex(wrapped);
    buttonsRef.current[wrapped]?.focus();
  }

  function activate(button: BubbleButton, returnFocus: boolean): void {
    if (button.onPress) {
      button.onPress();
      return;
    }
    const view = getView();
    if (!view) return;
    button.command(view.state, view.dispatch);
    if (returnFocus) view.focus();
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
          event.preventDefault();
          moveFocus(focusIndex + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveFocus(focusIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          moveFocus(0);
        } else if (event.key === "End") {
          event.preventDefault();
          moveFocus(buttons.length - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {buttons.map((button, index) => (
        <span key={button.id} className="bubble-menu-group">
          {index > 0 && button.group !== buttons[index - 1]?.group && <span className="bubble-menu-sep" />}
          <button
            ref={(element) => {
              buttonsRef.current[index] = element;
            }}
            type="button"
            title={button.label}
            aria-label={button.label}
            aria-pressed={button.active}
            tabIndex={index === focusIndex ? 0 : -1}
            className={button.active ? "is-active" : ""}
            onFocus={() => setFocusIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              activate(button, event.detail !== 0);
            }}
          >
            {button.content}
          </button>
        </span>
      ))}
    </div>
  );
}
