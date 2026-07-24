import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { productSchema } from "../editor/schema";
import type { RendererState } from "../store/types";
import { createMentionMenu } from "./mention-menu";
import {
  queryMentionSuggestions,
  queryTagSuggestions,
  type Suggestion,
} from "./suggestion-index";
import type { ReferenceOperation } from "./types";

export type MentionTrigger = "#" | "$" | "@" | "[[";

export type MentionState = {
  active: boolean;
  trigger: MentionTrigger;
  query: string;
  from: number;
  to: number;
  index: number;
  dismissedFrom: number | null;
};

export type MentionMenuItem =
  | { type: "suggestion"; group: "tags" | "people" | "notes"; suggestion: Suggestion }
  | { type: "create"; kind: "tag" | "person" | "note"; name: string };

export type MentionContext = {
  getState: () => RendererState;
  applyReferenceOperations: (operations: readonly ReferenceOperation[]) => void;
  createNote: (id: string, title: string) => void;
};

const inactiveState: MentionState = {
  active: false,
  trigger: "#",
  query: "",
  from: 0,
  to: 0,
  index: 0,
  dismissedFrom: null,
};

export const mentionPluginKey = new PluginKey<MentionState>("skriuw-mentions");

const TRIGGER_PATTERN = /(?:^|[\s([{])([#$@])([\p{L}\p{N}_-]{0,64})$/u;
const WIKI_TRIGGER_PATTERN = /\[\[([^\]\n]{0,96})$/;
const CONTEXT_WINDOW = 96;

function detectMention(state: EditorState, previous: MentionState): MentionState {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) {
    return inactiveState;
  }
  const windowStart = Math.max(0, $from.parentOffset - CONTEXT_WINDOW);
  const before = $from.parent.textBetween(windowStart, $from.parentOffset, "\0", "\0");

  const wikiMatch = before.match(WIKI_TRIGGER_PATTERN);
  if (wikiMatch) {
    const trigger: MentionTrigger = "[[";
    const query = wikiMatch[1] ?? "";
    const from = $from.pos - query.length - 2;
    if (previous.dismissedFrom !== null) {
      return previous.dismissedFrom === from
        ? { ...inactiveState, dismissedFrom: from }
        : { active: true, trigger, query, from, to: $from.pos, index: 0, dismissedFrom: null };
    }
    return {
      active: true,
      trigger,
      query,
      from,
      to: $from.pos,
      index: previous.active && previous.query === query ? previous.index : 0,
      dismissedFrom: null,
    };
  }

  const match = before.match(TRIGGER_PATTERN);
  if (!match) {
    return inactiveState;
  }
  const trigger = match[1] as MentionTrigger;
  const query = match[2] ?? "";
  const from = $from.pos - query.length - 1;
  if (previous.dismissedFrom !== null) {
    return previous.dismissedFrom === from
      ? { ...inactiveState, dismissedFrom: from }
      : { active: true, trigger, query, from, to: $from.pos, index: 0, dismissedFrom: null };
  }
  return {
    active: true,
    trigger,
    query,
    from,
    to: $from.pos,
    index: previous.active && previous.query === query ? previous.index : 0,
    dismissedFrom: null,
  };
}

export function mentionMenuItems(
  rendererState: RendererState,
  trigger: MentionTrigger,
  query: string,
): MentionMenuItem[] {
  const items: MentionMenuItem[] = [];
  const normalized = query.toLowerCase();
  if (trigger === "#") {
    const suggestions = queryTagSuggestions(rendererState, query);
    for (const suggestion of suggestions) {
      items.push({ type: "suggestion", group: "tags", suggestion });
    }
    const exact = suggestions.some((suggestion) => suggestion.label.toLowerCase() === normalized);
    if (query.length > 0 && !exact) {
      items.push({ type: "create", kind: "tag", name: query });
    }
    return items;
  }
  const grouped = queryMentionSuggestions(rendererState, query);
  if (trigger === "$") {
    for (const suggestion of grouped.people) {
      items.push({ type: "suggestion", group: "people", suggestion });
    }
    const exactPerson = grouped.people.some(
      (suggestion) => suggestion.label.toLowerCase() === normalized,
    );
    if (query.length > 0 && !exactPerson) {
      items.push({ type: "create", kind: "person", name: query });
    }
    return items;
  }
  for (const suggestion of grouped.notes) {
    items.push({ type: "suggestion", group: "notes", suggestion });
  }
  const exactNote = grouped.notes.some(
    (suggestion) => suggestion.label.toLowerCase() === normalized,
  );
  if (query.length > 0 && !exactNote) {
    items.push({ type: "create", kind: "note", name: query });
  }
  return items;
}

export function mentionState(state: EditorState): MentionState {
  return mentionPluginKey.getState(state) ?? inactiveState;
}

export function normalizedMentionIndex(index: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  return ((index % count) + count) % count;
}

function referenceNode(item: MentionMenuItem, context: MentionContext) {
  if (item.type === "create") {
    const id = crypto.randomUUID();
    const now = Date.now();
    const createdIn = context.getState().activeNoteId;
    if (item.kind === "tag") {
      context.applyReferenceOperations([
        {
          type: "create_tag",
          tag: { id, name: item.name, color: null, createdAt: now, updatedAt: now, createdIn },
        },
      ]);
      return productSchema.nodes.tag_ref?.create({ id, label: item.name }) ?? null;
    }
    if (item.kind === "note") {
      context.createNote(id, item.name);
      return productSchema.nodes.mention_ref?.create({ kind: "note", id, label: item.name }) ?? null;
    }
    context.applyReferenceOperations([
      {
        type: "create_person",
        person: {
          id,
          name: item.name,
          initials: null,
          color: null,
          note: null,
          createdAt: now,
          updatedAt: now,
          createdIn,
        },
      },
    ]);
    return productSchema.nodes.mention_ref?.create({ kind: "person", id, label: item.name }) ?? null;
  }
  const { suggestion } = item;
  if (suggestion.kind === "tag") {
    return productSchema.nodes.tag_ref?.create({ id: suggestion.id, label: suggestion.label }) ?? null;
  }
  return (
    productSchema.nodes.mention_ref?.create({
      kind: suggestion.kind,
      id: suggestion.id,
      label: suggestion.label,
    }) ?? null
  );
}

export function acceptMentionItem(
  view: EditorView,
  item: MentionMenuItem,
  context: MentionContext,
): boolean {
  const current = mentionState(view.state);
  if (!current.active) {
    return false;
  }
  const node = referenceNode(item, context);
  if (!node) {
    return false;
  }
  view.dispatch(
    view.state.tr.replaceWith(current.from, current.to, [node, productSchema.text(" ")]),
  );
  view.focus();
  return true;
}

export function dismissMention(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(mentionPluginKey, "dismiss"));
}

export function moveMentionSelection(view: EditorView, delta: number): void {
  view.dispatch(view.state.tr.setMeta(mentionPluginKey, delta));
}

export function handleMentionKey(
  view: EditorView,
  event: KeyboardEvent,
  context: MentionContext,
): boolean {
  const current = mentionState(view.state);
  if (!current.active) {
    return false;
  }
  if (event.key === "Escape") {
    dismissMention(view);
    return true;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    moveMentionSelection(view, event.key === "ArrowDown" ? 1 : -1);
    return true;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    const items = mentionMenuItems(context.getState(), current.trigger, current.query);
    const item = items[normalizedMentionIndex(current.index, items.length)];
    if (!item) {
      dismissMention(view);
      return event.key === "Tab";
    }
    return acceptMentionItem(view, item, context);
  }
  if (event.key === "]" && current.trigger === "[[") {
    const items = mentionMenuItems(context.getState(), current.trigger, current.query);
    const item = items[normalizedMentionIndex(current.index, items.length)];
    if (!item) {
      dismissMention(view);
      return false;
    }
    return acceptMentionItem(view, item, context);
  }
  return false;
}

export function createMentionPlugin(context: MentionContext): Plugin<MentionState> {
  return new Plugin<MentionState>({
    key: mentionPluginKey,
    state: {
      init: () => inactiveState,
      apply(transaction, previous, _oldState, newState) {
        const meta = transaction.getMeta(mentionPluginKey) as "dismiss" | number | undefined;
        if (meta === "dismiss") {
          return previous.active
            ? { ...inactiveState, dismissedFrom: previous.from }
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
