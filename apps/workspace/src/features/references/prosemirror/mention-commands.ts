import { PluginKey, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { productSchema } from "@/features/editor/schema";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";
import {
  mentionMenuItems,
  normalizedMentionIndex,
  type MentionMenuItem,
  type MentionTrigger,
} from "../mentions/menu-items";

export type MentionState = {
  active: boolean;
  trigger: MentionTrigger;
  query: string;
  from: number;
  to: number;
  index: number;
  dismissedFrom: number | null;
};

export type MentionContext = {
  getState: () => RendererState;
  applyReferenceOperations: (operations: readonly ReferenceOperation[]) => void;
  createNote: (id: string, title: string) => void;
};

export const inactiveMentionState: MentionState = {
  active: false,
  trigger: "#",
  query: "",
  from: 0,
  to: 0,
  index: 0,
  dismissedFrom: null,
};

export const mentionPluginKey = new PluginKey<MentionState>("skriuw-mentions");

export function mentionState(state: EditorState): MentionState {
  return mentionPluginKey.getState(state) ?? inactiveMentionState;
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
      return (
        productSchema.nodes.mention_ref?.create({ kind: "note", id, label: item.name }) ?? null
      );
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
    return (
      productSchema.nodes.mention_ref?.create({ kind: "person", id, label: item.name }) ?? null
    );
  }
  const { suggestion } = item;
  if (suggestion.kind === "tag") {
    return (
      productSchema.nodes.tag_ref?.create({ id: suggestion.id, label: suggestion.label }) ?? null
    );
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
  return false;
}
