import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { CalendarDaysIcon } from "@/shared/icons/static";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import { cn } from "@/shared/lib/utils";
import {
  JOURNAL_DATE_SUGGESTIONS,
  resolveJournalDateExpression,
  type JournalDateResolution,
} from "@skriuw/renderer-core/journal/date-expressions";
import { formatLongDate, todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { onJournalGoToDate, openJournalDay } from "./navigation";

type HostProps = {
  selectedKey: DateKey;
};

/**
 * Owns the "Go to date…" dialog for the journal route. Closed, it renders
 * nothing and subscribes to nothing; each open mounts a fresh body anchored on
 * the day being viewed.
 */
export function JournalGoToDateHost({ selectedKey }: HostProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => onJournalGoToDate(() => setOpen(true)), []);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Go to date"
      showHeader={false}
      className="mx-auto mb-auto mt-[12dvh] max-h-[calc(var(--viewport-height)*0.76)] w-[calc(100vw-1.5rem)] max-w-md overflow-hidden"
    >
      <GoToDateBody context={selectedKey} />
    </Dialog>
  );
}

type BodyProps = {
  context: DateKey;
};

function destinationText(resolution: Extract<JournalDateResolution, { ok: true }>): string {
  if (resolution.granularity === "day") {
    return resolution.label;
  }
  return `${resolution.label} · opens ${formatLongDate(resolution.key)}`;
}

function GoToDateBody({ context }: BodyProps) {
  const closeDialog = useDialogClose();
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const previewId = useId();
  const today = todayKey();
  const typing = query.trim().length > 0;
  const resolution = typing ? resolveJournalDateExpression(query, context, today) : null;
  const suggestions = typing
    ? []
    : JOURNAL_DATE_SUGGESTIONS.map((suggestion) => ({
        ...suggestion,
        resolution: resolveJournalDateExpression(suggestion.expression, context, today),
      }));

  const { activeIndex, listRef, onKeyDown, setActiveIndex } = useListboxNavigation({
    count: suggestions.length,
    onSelect: (index) => {
      const suggestion = suggestions[index];
      if (suggestion) {
        go(suggestion.resolution);
      }
    },
  });
  const activeSuggestion = suggestions[activeIndex];

  function go(target: JournalDateResolution): void {
    if (!target.ok) {
      return;
    }
    closeDialog();
    openJournalDay(target.key);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" && resolution !== null) {
      event.preventDefault();
      go(resolution);
      return;
    }
    onKeyDown(event);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-2.5 border-b border-border px-3.5 py-3 text-muted-foreground">
        <CalendarDaysIcon size={16} aria-hidden="true" />
        <input
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Go to date… e.g. next week thursday"
          aria-label="Date to go to"
          aria-describedby={previewId}
          aria-invalid={resolution !== null && !resolution.ok}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeSuggestion ? `${listboxId}-item-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="flex-none rounded border border-border bg-muted px-[5px] py-px font-mono text-[10px] text-muted-foreground">
          Esc
        </kbd>
      </div>

      <p
        id={previewId}
        role="status"
        className={cn(
          "flex-none border-b border-border px-3.5 py-2.5 text-[12px]",
          resolution === null && "text-muted-foreground",
          resolution?.ok === true && "text-foreground",
          resolution?.ok === false && "text-destructive",
        )}
      >
        {resolution === null
          ? "Pick a suggestion or type a date."
          : resolution.ok
            ? destinationText(resolution)
            : resolution.message}
      </p>

      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Date suggestions"
        hidden={suggestions.length === 0}
        className="min-h-0 flex-auto overflow-y-auto p-1.5"
      >
        {suggestions.map((suggestion, index) => {
          const isActive = index === activeIndex;
          const destination = suggestion.resolution.ok
            ? destinationText(suggestion.resolution)
            : suggestion.resolution.message;
          return (
            <button
              key={suggestion.expression}
              type="button"
              tabIndex={-1}
              id={`${listboxId}-item-${index}`}
              data-index={index}
              role="option"
              aria-selected={isActive}
              aria-label={`${suggestion.expression}, ${destination}`}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => go(suggestion.resolution)}
              className={cn(
                "flex w-full cursor-pointer items-baseline gap-2.5 rounded-md border-none bg-transparent px-2.5 py-2 text-left transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px]">{suggestion.expression}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {suggestion.description}
                </span>
              </span>
              <span className="ml-auto flex-none text-[11px] text-muted-foreground">
                {destination}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-none items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ choose</span>
        <span>↵ go</span>
        <span className="ml-auto">esc close</span>
      </div>
    </div>
  );
}
