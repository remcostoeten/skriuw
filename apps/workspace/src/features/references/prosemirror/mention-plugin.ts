import { Plugin, type EditorState } from "prosemirror-state";
import type { MentionTrigger } from "../mentions/menu-items";
import {
  handleMentionKey,
  inactiveMentionState,
  mentionPluginKey,
  type MentionContext,
  type MentionState,
} from "./mention-commands";
import { createMentionMenu } from "./mention-menu";

const TRIGGER_PATTERN = /(?:^|[\s([{])([#$])([\p{L}\p{N}_-]{0,64})$/u;
const NOTE_TRIGGER_PATTERN = /(?:^|[\s([{])@((?:[\p{L}\p{N}_-][\p{L}\p{N}_ -]{0,95})?)$/u;
const CONTEXT_WINDOW = 96;

function activeMentionState(
  previous: MentionState,
  trigger: MentionTrigger,
  query: string,
  from: number,
  to: number,
): MentionState {
  if (previous.dismissedFrom !== null) {
    return previous.dismissedFrom === from
      ? { ...inactiveMentionState, dismissedFrom: from }
      : { active: true, trigger, query, from, to, index: 0, dismissedFrom: null };
  }
  return {
    active: true,
    trigger,
    query,
    from,
    to,
    index: previous.active && previous.query === query ? previous.index : 0,
    dismissedFrom: null,
  };
}

function detectMention(state: EditorState, previous: MentionState): MentionState {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) {
    return inactiveMentionState;
  }
  const windowStart = Math.max(0, $from.parentOffset - CONTEXT_WINDOW);
  const before = $from.parent.textBetween(windowStart, $from.parentOffset, "\0", "\0");

  const noteMatch = before.match(NOTE_TRIGGER_PATTERN);
  if (noteMatch) {
    const query = noteMatch[1] ?? "";
    return activeMentionState(previous, "@", query, $from.pos - query.length - 1, $from.pos);
  }

  const match = before.match(TRIGGER_PATTERN);
  if (!match) {
    return inactiveMentionState;
  }
  const trigger = match[1] as MentionTrigger;
  const query = match[2] ?? "";
  return activeMentionState(previous, trigger, query, $from.pos - query.length - 1, $from.pos);
}

export function createMentionPlugin(context: MentionContext): Plugin<MentionState> {
  return new Plugin<MentionState>({
    key: mentionPluginKey,
    state: {
      init: () => inactiveMentionState,
      apply(transaction, previous, _oldState, newState) {
        const meta = transaction.getMeta(mentionPluginKey) as "dismiss" | number | undefined;
        if (meta === "dismiss") {
          return previous.active
            ? { ...inactiveMentionState, dismissedFrom: previous.from }
            : previous;
        }
        if (typeof meta === "number") {
          return previous.active ? { ...previous, index: previous.index + meta } : previous;
        }
        if (!transaction.docChanged && !transaction.selectionSet) {
          return previous;
        }
        return detectMention(newState, previous);
      },
    },
    props: {
      handleKeyDown(view, event) {
        return handleMentionKey(view, event, context);
      },
    },
    view(editorView) {
      return createMentionMenu(editorView, context);
    },
  });
}
