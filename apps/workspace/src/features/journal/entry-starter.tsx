import { useMemo, useState } from "react";
import { FileTextIcon } from "@/shared/icons/static";
import type { NoteTemplate } from "@/features/templates/note-templates";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import type { DateKey } from "./dates";
import {
  applyJournalTemplate,
  journalTemplates,
  rememberedJournalTemplate,
} from "./journal-template";

type EntryStarterProps = {
  store: RendererStore;
  noteId: string;
  dateKey: DateKey;
};

type TemplateChoice = Pick<NoteTemplate, "id" | "name">;

const PICKER_ID = "journal-template-picker";

const starterButtonClass =
  "flex min-h-8 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 pointer-coarse:px-3.5 pointer-coarse:text-[14px]";

function sameChoices(left: readonly TemplateChoice[], right: readonly TemplateChoice[]): boolean {
  return (
    left.length === right.length &&
    left.every((choice, index) => {
      const other = right[index];
      return other !== undefined && choice.id === other.id && choice.name === other.name;
    })
  );
}

function selectChoices(state: RendererState): TemplateChoice[] {
  return journalTemplates(state).map(({ id, name }) => ({ id, name }));
}

function selectRememberedId(state: RendererState): string | null {
  return rememberedJournalTemplate(state)?.id ?? null;
}

function reportRejection(error: unknown): void {
  console.error("apply journal template rejected", error);
}

/**
 * Offered only while the entry has no words. One press fills the day from the
 * remembered template; picking another template applies it and becomes the
 * remembered one. Browsing days never applies anything on its own, so an
 * unvisited day stays empty and out of the entry lists.
 */
export function EntryStarter({ store, noteId, dateKey }: EntryStarterProps) {
  const choices = useRendererSelector(store, selectChoices, sameChoices);
  const rememberedId = useRendererSelector(store, selectRememberedId);
  const [choosing, setChoosing] = useState(false);
  const remembered = useMemo(
    () => choices.find((choice) => choice.id === rememberedId) ?? null,
    [choices, rememberedId],
  );

  function apply(templateId: string): void {
    const template = journalTemplates(store.getState()).find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }
    setChoosing(false);
    applyJournalTemplate(store, noteId, dateKey, template).catch(reportRejection);
  }

  return (
    <div className="journal-entry-starter" data-journal-starter>
      <div className="flex flex-wrap items-center gap-1.5">
        {remembered !== null && (
          <button type="button" onClick={() => apply(remembered.id)} className={starterButtonClass}>
            <FileTextIcon size={13} aria-hidden="true" />
            Start from {remembered.name}
          </button>
        )}
        <button
          type="button"
          aria-expanded={choosing}
          aria-controls={PICKER_ID}
          onClick={() => setChoosing((open) => !open)}
          className={starterButtonClass}
        >
          {remembered === null && <FileTextIcon size={13} aria-hidden="true" />}
          {remembered === null ? "Start from a template" : "Change template"}
        </button>
      </div>
      {choosing && (
        <ul id={PICKER_ID} aria-label="Journal templates" className="mt-2 flex flex-wrap gap-1.5">
          {choices.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                aria-current={choice.id === rememberedId ? "true" : undefined}
                onClick={() => apply(choice.id)}
                className={`${starterButtonClass} ${
                  choice.id === rememberedId ? "bg-muted text-foreground" : ""
                }`}
              >
                {choice.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
