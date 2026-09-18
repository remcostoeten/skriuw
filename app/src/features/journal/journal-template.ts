import type { WorkspaceOperation, WorkspaceSettings } from "@/contracts/workspace";
import { boundTitle } from "@/features/editor/note-title";
import {
  countWords,
  parseProductMarkdown,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { NOTE_TEMPLATES, type NoteTemplate } from "@/features/templates/note-templates";
import { personalTemplates } from "@/features/templates/personal-templates";
import { documentTitleText, type IdFactory } from "@/store/actions/duplicate-note";
import { commitOperations, isRevisionConflict } from "@/store/actions/workspace";
import { noop } from "@/shared/lib/noop";
import { flushPendingWork } from "@/shell/pending-work";
import type { RendererState, RendererStore } from "@/store/types";
import { parseDateKey, type DateKey } from "./dates";

export const JOURNAL_TEMPLATE_SETTING = "journalTemplateId";

const BLANK_TEMPLATE_ID = "blank";

/** The template id remembered for new journal entries, or null when none is chosen. */
export function journalTemplateId(settings: WorkspaceSettings): string | null {
  const value = settings[JOURNAL_TEMPLATE_SETTING];
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : null;
}

/** Every template an entry can start from: the built-in scaffolds, then saved personal ones. */
export function journalTemplates(state: RendererState): NoteTemplate[] {
  return [
    ...NOTE_TEMPLATES.filter((template) => template.id !== BLANK_TEMPLATE_ID),
    ...savedTemplates(state),
  ];
}

/**
 * The template picker owns reporting a corrupt saved-template list; the
 * journal falls back to the built-in scaffolds instead of failing the day view.
 */
function savedTemplates(state: RendererState): NoteTemplate[] {
  try {
    return personalTemplates(state);
  } catch {
    noop();
    return [];
  }
}

/** Null when nothing is remembered or the remembered source note is gone. */
export function rememberedJournalTemplate(state: RendererState): NoteTemplate | null {
  const id = journalTemplateId(state.settings);
  if (id === null) {
    return null;
  }
  return journalTemplates(state).find((template) => template.id === id) ?? null;
}

/**
 * Noon of the entry's own day, so a template's date stamps name the day being
 * written about rather than the day the button was pressed.
 */
function templateInstant(dateKey: DateKey): number {
  const date = parseDateKey(dateKey);
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

export type JournalTemplatePlanParams = {
  template: NoteTemplate;
  noteId: string;
  dateKey: DateKey;
  expectedRevision: number;
  at: number;
  createId: IdFactory;
};

/**
 * The operations that fill an existing entry from `template`. The template's
 * properties are left out on purpose: an entry's date and mood fields are the
 * journal's own, and a personal template saved from another entry would
 * otherwise overwrite them.
 */
export function planJournalTemplate(params: JournalTemplatePlanParams): WorkspaceOperation[] {
  const instant = templateInstant(params.dateKey);
  const document =
    params.template.buildDocument?.(instant, params.createId) ??
    parseProductMarkdown(params.template.buildMarkdown(instant));
  const documentJson = document.toJSON();
  const headingText = documentTitleText(documentJson);
  const operations: WorkspaceOperation[] = [
    {
      type: "save_document",
      noteId: params.noteId,
      documentJson,
      markdown: serializeProductMarkdown(document),
      wordCount: countWords(document),
      expectedRevision: params.expectedRevision,
      at: params.at,
    },
  ];
  if (headingText.length > 0) {
    operations.push({
      type: "rename_node",
      id: params.noteId,
      title: boundTitle(headingText),
      at: params.at,
    });
  }
  return operations;
}

/**
 * Fills the entry from `template` and remembers the choice for the next empty
 * day. Refuses an entry that already has words, so the button can never
 * replace writing that landed between render and click.
 */
export async function applyJournalTemplate(
  store: RendererStore,
  noteId: string,
  dateKey: DateKey,
  template: NoteTemplate,
): Promise<void> {
  await flushPendingWork();
  const record = store.getState().documents.get(noteId);
  if (!record || record.wordCount > 0) {
    return;
  }
  function applyAt(expectedRevision: number): Promise<void> {
    const operations = planJournalTemplate({
      template,
      noteId,
      dateKey,
      expectedRevision,
      at: Date.now(),
      createId: () => crypto.randomUUID(),
    });
    const settings = store.getState().settings;
    if (journalTemplateId(settings) !== template.id) {
      operations.push({
        type: "update_settings",
        settings: { ...settings, [JOURNAL_TEMPLATE_SETTING]: template.id },
      });
    }
    return commitOperations(store, operations);
  }
  try {
    await applyAt(record.revision);
  } catch (error) {
    const fresh = store.getState().documents.get(noteId);
    if (
      !isRevisionConflict(error) ||
      !fresh ||
      fresh.revision === record.revision ||
      fresh.wordCount > 0
    ) {
      throw error;
    }
    await applyAt(fresh.revision);
  }
}
