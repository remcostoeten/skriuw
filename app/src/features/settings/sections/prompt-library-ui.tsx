import type { PromptInputShape } from "@/contracts/workspace";
import {
  MAX_PROMPT_SYSTEM_BYTES,
  promptDraftError,
  type PromptDraft,
  type PromptLibraryEntry,
} from "@/features/ai/prompt-library";
import { cn } from "@/shared/lib/utils";
import {
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsTextInput,
} from "./settings-shared";

type Props = {
  entries: readonly PromptLibraryEntry[];
  draft: PromptDraft | null;
  editingKey: string | null;
  onEdit: (entry: PromptLibraryEntry) => void;
  onDraftChange: (change: Partial<PromptDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDuplicate: (entry: PromptLibraryEntry) => void;
  onReset: (entry: PromptLibraryEntry) => void;
  onDelete: (entry: PromptLibraryEntry) => void;
  onCreate: () => void;
};

const INPUT_SHAPES: readonly { value: PromptInputShape; label: string }[] = [
  { value: "selection", label: "Selected text" },
  { value: "note", label: "Whole note" },
  { value: "freeform", label: "Anything you type" },
];

const fieldLabelClass = "mb-1 block text-[11px] font-medium text-muted-foreground";
const textareaClass =
  "min-h-[96px] w-full resize-y rounded-lg border border-border bg-muted px-2.5 py-[6px] font-mono text-[12px] leading-[1.5] text-foreground outline-none focus-visible:border-foreground/70";

function originLabel(origin: PromptLibraryEntry["origin"]): string | null {
  if (origin === "customised") {
    return "Modified";
  }
  return origin === "user" ? "Yours" : null;
}

export function PromptLibraryPanel({
  entries,
  draft,
  editingKey,
  onEdit,
  onDraftChange,
  onSave,
  onCancel,
  onDuplicate,
  onReset,
  onDelete,
  onCreate,
}: Props) {
  return (
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>Prompts</div>
      <p className={settingsGroupHint}>
        The instructions behind each writing action. Edit a built-in to make your own copy of
        it; reset puts the shipped one back. Prompts hold no keys and sync with the rest of
        your workspace.
      </p>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        {entries.map((entry) => (
          <li key={entry.key}>
            {editingKey === entry.key && draft !== null ? (
              <PromptEditor
                draft={draft}
                onDraftChange={onDraftChange}
                onSave={onSave}
                onCancel={onCancel}
              />
            ) : (
              <PromptRow
                entry={entry}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onReset={onReset}
                onDelete={onDelete}
              />
            )}
          </li>
        ))}
      </ul>
      {editingKey === "new" && draft !== null ? (
        <div className="mt-1.5">
          <PromptEditor
            draft={draft}
            onDraftChange={onDraftChange}
            onSave={onSave}
            onCancel={onCancel}
          />
        </div>
      ) : (
        <button type="button" className={cn(settingsButton, "mt-3")} onClick={onCreate}>
          New prompt
        </button>
      )}
    </div>
  );
}

type RowProps = Pick<Props, "onEdit" | "onDuplicate" | "onReset" | "onDelete"> & {
  entry: PromptLibraryEntry;
};

function PromptRow({ entry, onEdit, onDuplicate, onReset, onDelete }: RowProps) {
  const badge = originLabel(entry.origin);
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="flex items-center gap-2 text-[13px] text-foreground">
          <span className="truncate">{entry.name}</span>
          {badge === null ? null : (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-[11px] leading-[1.4] text-muted-foreground">
          {entry.systemPrompt}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" className={settingsButton} onClick={() => onEdit(entry)}>
          Edit
        </button>
        <button type="button" className={settingsButton} onClick={() => onDuplicate(entry)}>
          Duplicate
        </button>
        {entry.origin === "customised" ? (
          <button
            type="button"
            className={cn(settingsButton, settingsButtonDanger)}
            onClick={() => onReset(entry)}
          >
            Reset
          </button>
        ) : null}
        {entry.origin === "user" ? (
          <button
            type="button"
            className={cn(settingsButton, settingsButtonDanger)}
            onClick={() => onDelete(entry)}
          >
            Delete
          </button>
        ) : null}
      </span>
    </div>
  );
}

type EditorProps = Pick<Props, "onDraftChange" | "onSave" | "onCancel"> & {
  draft: PromptDraft;
};

function PromptEditor({ draft, onDraftChange, onSave, onCancel }: EditorProps) {
  const error = promptDraftError(draft);
  return (
    <section
      aria-label={`Edit ${draft.name.trim().length === 0 ? "prompt" : draft.name}`}
      className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"
    >
      <label className="mb-2.5 block">
        <span className={fieldLabelClass}>Name</span>
        <input
          className={cn(settingsTextInput, "w-full")}
          value={draft.name}
          placeholder="Standup summary"
          onChange={(event) => onDraftChange({ name: event.target.value })}
        />
      </label>
      <label className="mb-2.5 block">
        <span className={fieldLabelClass}>System prompt</span>
        <textarea
          className={textareaClass}
          rows={5}
          value={draft.systemPrompt}
          maxLength={MAX_PROMPT_SYSTEM_BYTES}
          placeholder="Tell the model what to do with the text."
          onChange={(event) => onDraftChange({ systemPrompt: event.target.value })}
        />
      </label>
      <div className="mb-2.5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className={fieldLabelClass}>Expects</span>
          <select
            aria-label="Expects"
            className={cn(settingsTextInput, "w-auto cursor-pointer")}
            value={draft.inputShape}
            onChange={(event) =>
              onDraftChange({ inputShape: event.target.value as PromptInputShape })
            }
          >
            {INPUT_SHAPES.map((shape) => (
              <option key={shape.value} value={shape.value}>
                {shape.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className={fieldLabelClass}>Temperature</span>
          <input
            aria-label="Temperature"
            className={cn(settingsTextInput, "w-[110px]")}
            inputMode="decimal"
            placeholder="default"
            value={draft.temperature}
            onChange={(event) => onDraftChange({ temperature: event.target.value })}
          />
        </label>
        <label className="flex flex-col">
          <span className={fieldLabelClass}>Max output bytes</span>
          <input
            aria-label="Max output bytes"
            className={cn(settingsTextInput, "w-[130px]")}
            inputMode="numeric"
            value={draft.maxOutputBytes}
            onChange={(event) => onDraftChange({ maxOutputBytes: event.target.value })}
          />
        </label>
      </div>
      {error === null ? null : (
        <p role="alert" className="mb-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={settingsButton}
          disabled={error !== null}
          onClick={onSave}
        >
          Save
        </button>
        <button type="button" className={settingsButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
