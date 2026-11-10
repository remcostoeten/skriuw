import { referenceKey, type ReferenceKind } from "@skriuw/renderer-core/references/types";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { ancestorIds } from "@skriuw/renderer-core/store/tree";
import { JOURNAL_ROOT_ID } from "@skriuw/renderer-core/journal/constants";
import { notePreviewLines, type PalettePreview } from "@/commands/palette-preview";
import { compactAge } from "@/commands/recent-notes";

const ENTITY_NOTE_LIMIT = 12;

function countLabel(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function noteTitle(state: RendererState, noteId: string): string {
  return state.metadata.get(noteId)?.title || state.nodes.get(noteId)?.title || "Untitled";
}

function folderTrail(state: RendererState, noteId: string): string | null {
  const titles = ancestorIds(state.nodes, noteId)
    .filter((id) => id !== JOURNAL_ROOT_ID)
    .map((id) => state.nodes.get(id)?.title || "Untitled");
  return titles.length > 0 ? titles.join(" / ") : null;
}

function referenceChips(state: RendererState, noteId: string): string[] {
  const chips: string[] = [];
  for (const target of state.outgoingReferences.get(noteId) ?? []) {
    if (target.kind === "tag") {
      const tag = state.tags.get(target.targetId);
      if (tag) chips.push(`#${tag.name}`);
    } else if (target.kind === "person") {
      const person = state.people.get(target.targetId);
      if (person) chips.push(`$${person.name}`);
    }
  }
  return chips;
}

function notePreview(state: RendererState, noteId: string, now: number): PalettePreview | null {
  if (!state.nodes.has(noteId)) {
    return null;
  }
  const document = state.documents.get(noteId);
  const metadata = state.metadata.get(noteId);
  const locked = Boolean(document?.sealed);
  const title = noteTitle(state, noteId);
  const excerpt = locked ? [] : notePreviewLines(document?.markdown ?? "");
  const repeatsTitle = excerpt[0]?.tone === "heading" && excerpt[0].text === title;
  const lines = repeatsTitle ? excerpt.slice(1) : excerpt;
  const meta = [
    folderTrail(state, noteId),
    locked ? null : countLabel(metadata?.wordCount ?? document?.wordCount ?? 0, "word"),
    metadata ? `edited ${compactAge(metadata.updatedAt, now)}` : null,
  ].filter((entry) => entry !== null);
  return {
    title,
    meta,
    lines,
    placeholder: locked ? "Locked. Open the note to unlock it." : "Nothing written yet.",
    chips: referenceChips(state, noteId),
  };
}

function entityPreview(
  state: RendererState,
  kind: Exclude<ReferenceKind, "note">,
  id: string,
): PalettePreview | null {
  const name = kind === "tag" ? state.tags.get(id)?.name : state.people.get(id)?.name;
  if (name === undefined) {
    return null;
  }
  const noteIds = state.incomingReferences.get(referenceKey(kind, id)) ?? [];
  return {
    title: `${kind === "tag" ? "#" : "$"}${name}`,
    meta: [countLabel(noteIds.length, "note")],
    lines: noteIds
      .slice(0, ENTITY_NOTE_LIMIT)
      .map((noteId) => ({ text: noteTitle(state, noteId), tone: "item" })),
    placeholder: kind === "tag" ? "No note carries this tag yet." : "No note mentions them yet.",
    chips: [],
  };
}

/**
 * @name palettePreviewFor
 * @description Builds the palette preview for a note, tag or person row from
 * state already in memory, keyed by the row's id prefix. Returns null for rows
 * the palette describes itself, such as commands.
 * @example palettePreviewFor(store.getState(), "note:note-alpha", Date.now())
 */
export function palettePreviewFor(
  state: RendererState,
  itemId: string,
  now: number,
): PalettePreview | null {
  const separator = itemId.indexOf(":");
  if (separator < 0) {
    return null;
  }
  const kind = itemId.slice(0, separator);
  const id = itemId.slice(separator + 1);
  if (kind === "note" || kind === "recent") {
    return notePreview(state, id, now);
  }
  if (kind === "tag" || kind === "person") {
    return entityPreview(state, kind, id);
  }
  return null;
}
