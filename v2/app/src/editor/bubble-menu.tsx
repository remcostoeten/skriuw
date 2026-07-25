import type { ReactNode } from "react";
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
} from "../shared/icons";
import { productSchema } from "./schema";

export type BubbleMenuState = {
  open: boolean;
  x: number;
  y: number;
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
  headingLevel: number | null;
  blockquote: boolean;
};

export const closedBubbleMenu: BubbleMenuState = {
  open: false,
  x: 0,
  y: 0,
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
  link: false,
  headingLevel: null,
  blockquote: false,
};

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
  const start = view.coordsAtPos(selection.from);
  const end = view.coordsAtPos(selection.to);
  const sameLine = start.top === end.top;
  const parent = selection.$from.parent;
  return {
    open: true,
    x: Math.max(12, sameLine ? (start.left + end.left) / 2 : start.left),
    y: start.top,
    bold: markActive(state, requiredMark("strong")),
    italic: markActive(state, requiredMark("em")),
    strikethrough: markActive(state, requiredMark("strikethrough")),
    code: markActive(state, requiredMark("code")),
    link: markActive(state, requiredMark("link")),
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

type BubbleButton = {
  id: string;
  label: string;
  active: boolean;
  content: ReactNode;
  command: Command;
  onPress?: () => void;
};

type Props = {
  state: BubbleMenuState;
  getView: () => EditorView | null;
  onLink: () => void;
};

export function BubbleMenu({ state, getView, onLink }: Props) {
  if (!state.open) return null;
  const buttons: BubbleButton[] = [
    {
      id: "bold",
      label: "Bold",
      active: state.bold,
      content: <BoldIcon size={14} />,
      command: toggleMark(requiredMark("strong")),
    },
    {
      id: "italic",
      label: "Italic",
      active: state.italic,
      content: <ItalicIcon size={14} />,
      command: toggleMark(requiredMark("em")),
    },
    {
      id: "strikethrough",
      label: "Strikethrough",
      active: state.strikethrough,
      content: <StrikethroughIcon size={14} />,
      command: toggleMark(requiredMark("strikethrough")),
    },
    {
      id: "code",
      label: "Inline code",
      active: state.code,
      content: <CodeIcon size={14} />,
      command: toggleMark(requiredMark("code")),
    },
    {
      id: "link",
      label: "Link",
      active: state.link,
      content: <LinkIcon size={14} />,
      command: () => true,
      onPress: onLink,
    },
    ...[1, 2, 3].map((level) => ({
      id: `heading-${level}`,
      label: `Heading ${level}`,
      active: state.headingLevel === level,
      content: `H${level}` as ReactNode,
      command: toggleHeading(level, state.headingLevel === level),
    })),
    {
      id: "blockquote",
      label: "Quote",
      active: state.blockquote,
      content: <TextQuoteIcon size={14} />,
      command: toggleBlockquote(state.blockquote),
    },
  ];
  return (
    <div
      className="bubble-menu"
      role="toolbar"
      aria-label="Text formatting"
      style={{ left: state.x, top: state.y }}
    >
      {buttons.map((button, index) => (
        <span key={button.id} className="bubble-menu-group">
          {(index === 5 || index === 8) && <span className="bubble-menu-sep" />}
          <button
            type="button"
            title={button.label}
            aria-label={button.label}
            aria-pressed={button.active}
            className={button.active ? "is-active" : ""}
            onMouseDown={(event) => {
              event.preventDefault();
              if (button.onPress) {
                button.onPress();
                return;
              }
              const view = getView();
              if (!view) return;
              button.command(view.state, view.dispatch);
              view.focus();
            }}
          >
            {button.content}
          </button>
        </span>
      ))}
    </div>
  );
}
