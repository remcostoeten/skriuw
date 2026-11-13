import type { RendererState } from "@skriuw/renderer-core/store/types";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import { MAX_TITLE_INPUT_BYTES } from "@/features/ai/title-completion";
import { selectJournalEntries } from "./model";

export const JOURNAL_AUTO_TITLE_SETTING = "aiJournalTitles";
export const JOURNAL_AUTO_TITLE_ORIGIN = "journal:auto-title";
export const JOURNAL_AUTO_TITLE_MIN_WORDS = 20;

const UNTITLED = "Untitled";
const MAX_TITLE_LENGTH = 80;
const encoder = new TextEncoder();

export type AutoTitleEntry = {
  noteId: string;
  markdown: string;
};

export function selectJournalAutoTitles(state: RendererState): boolean {
  return state.settings[JOURNAL_AUTO_TITLE_SETTING] === true;
}

function entryText(state: RendererState, noteId: string): string | null {
  if ((state.sourceNodes.get(noteId)?.lockedAt ?? null) !== null) {
    return null;
  }
  const document = state.documents.get(noteId);
  if (document === undefined || (document.sealed ?? null) !== null) {
    return null;
  }
  const size = encoder.encode(document.markdown).length;
  return size === 0 || size > MAX_TITLE_INPUT_BYTES ? null : document.markdown;
}

/**
 * @name nextAutoTitleEntry
 * @description The newest journal entry an automatic title may be written for:
 * still untitled, long enough to name, not today's (it is still being
 * written), not locked, and not already tried this session.
 *
 * @example
 * const entry = nextAutoTitleEntry(store.getState(), todayKey(), attempted);
 */
export function nextAutoTitleEntry(
  state: RendererState,
  today: DateKey,
  attempted: ReadonlySet<string>,
): AutoTitleEntry | null {
  for (const entry of selectJournalEntries(state)) {
    if (
      entry.title !== UNTITLED ||
      entry.dateKey === today ||
      entry.wordCount < JOURNAL_AUTO_TITLE_MIN_WORDS ||
      attempted.has(entry.noteId)
    ) {
      continue;
    }
    const markdown = entryText(state, entry.noteId);
    if (markdown !== null) {
      return { noteId: entry.noteId, markdown };
    }
  }
  return null;
}

/**
 * @name journalEntryIsUntitled
 * @description Whether an entry still has no title, checked again right before
 * a generated one is written so a title typed meanwhile is never replaced.
 *
 * @example
 * if (journalEntryIsUntitled(store.getState(), noteId)) rename(noteId, title);
 */
export function journalEntryIsUntitled(state: RendererState, noteId: string): boolean {
  return selectJournalEntries(state).some(
    (entry) => entry.noteId === noteId && entry.title === UNTITLED,
  );
}

/**
 * @name titleFromReply
 * @description The title inside a model reply: its first written line without
 * wrapping quotes, heading marks or a trailing full stop, cut to a length a
 * list row can show. Null when nothing usable is left.
 *
 * @example
 * titleFromReply('"A slow Sunday."\n\nHope that helps'); // "A slow Sunday"
 */
export function titleFromReply(reply: string): string | null {
  const line = reply
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  if (line === undefined) {
    return null;
  }
  const title = line
    // Leading Markdown heading marks, then wrapping quotes or emphasis, then a closing full stop.
    .replace(/^#+\s*/, "")
    .replace(/^["'“”‘’*_`]+|["'“”‘’*_`]+$/g, "")
    .replace(/\.$/, "")
    .trim();
  if (title.length === 0 || title === UNTITLED) {
    return null;
  }
  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : title;
}
