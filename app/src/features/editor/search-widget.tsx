import { useId } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaseSensitiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  RegexIcon,
  ReplaceAllIcon,
  ReplaceIcon,
  WholeWordIcon,
} from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { Tooltip } from "@/shared/ui/tooltip";
import type { EditorSearchShortcutId } from "./editor-bound-shortcut-ids";
import type { SearchOptions } from "./search-plugin";

type Props = {
  ref?: Ref<HTMLInputElement>;
  optionHints: Record<EditorSearchShortcutId, string | undefined>;
  query: string;
  onQueryChange: (value: string) => void;
  replaceValue: string;
  onReplaceChange: (value: string) => void;
  showReplace: boolean;
  onToggleReplace: () => void;
  options: SearchOptions;
  onToggleOption: (key: keyof SearchOptions) => void;
  current: number;
  total: number;
  regexError: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
};

const fieldClass =
  "flex min-w-0 flex-1 items-center rounded-md border border-border bg-background pl-2 transition-[border-color,box-shadow] duration-150 focus-within:border-ring";
const inputClass =
  "min-w-0 flex-1 bg-transparent py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground";
const countClass =
  "shrink-0 text-right text-xs tabular-nums text-muted-foreground @max-[360px]/editor-search:hidden";

function IconButton({
  label,
  shortcut,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="bottom">
      <button
        type="button"
        aria-label={shortcut ? `${label} (${shortcut})` : label}
        aria-pressed={active}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
          active &&
            "bg-foreground/14 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.28)]",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function SearchWidget({
  ref,
  optionHints,
  query,
  onQueryChange,
  replaceValue,
  onReplaceChange,
  showReplace,
  onToggleReplace,
  options,
  onToggleOption,
  current,
  total,
  regexError,
  onNext,
  onPrevious,
  onClose,
  onReplaceCurrent,
  onReplaceAll,
}: Props) {
  const statusId = useId();
  const countLabel = regexError
    ? "Invalid regex"
    : query.length === 0
      ? ""
      : total === 0
        ? "No results"
        : `${current + 1} of ${total}`;
  const noMatches = total === 0;

  function handleFindKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function handleReplaceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onReplaceCurrent();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <search
      aria-label="Find and replace"
      className="flex w-full items-stretch gap-1"
    >
      <Tooltip label={showReplace ? "Hide replace" : "Show replace"} side="bottom">
        <button
          type="button"
          aria-label={showReplace ? "Hide replace" : "Show replace"}
          aria-expanded={showReplace}
          onClick={onToggleReplace}
          className="flex w-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground"
        >
          {showReplace ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
        </button>
      </Tooltip>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1">
          <div
            className={cn(
              fieldClass,
              regexError &&
                "border-destructive shadow-[inset_0_0_0_1px_hsl(var(--destructive))]",
            )}
          >
            <input
              ref={ref}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder="Find"
              aria-label="Find"
              aria-invalid={regexError}
              aria-describedby={statusId}
              spellCheck={false}
              className={inputClass}
            />
            <div className="flex items-center gap-0.5 pl-1 pr-0.5">
              <IconButton
                label="Match case"
                shortcut={optionHints.searchMatchCase}
                active={options.caseSensitive}
                onClick={() => onToggleOption("caseSensitive")}
              >
                <CaseSensitiveIcon size={16} />
              </IconButton>
              <IconButton
                label="Match whole word"
                shortcut={optionHints.searchWholeWord}
                active={options.wholeWord}
                onClick={() => onToggleOption("wholeWord")}
              >
                <WholeWordIcon size={16} />
              </IconButton>
              <IconButton
                label="Use regular expression"
                shortcut={optionHints.searchRegex}
                active={options.regex}
                onClick={() => onToggleOption("regex")}
              >
                <RegexIcon size={16} />
              </IconButton>
            </div>
          </div>

          <span
            id={statusId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(countClass, noMatches && query.length > 0 && "text-destructive")}
          >
            {countLabel}
          </span>

          <div className="flex shrink-0 items-center gap-0.5 ml-auto">
            <IconButton
              label="Previous match"
              shortcut="Shift+Enter"
              onClick={onPrevious}
              disabled={total === 0}
            >
              <ArrowUpIcon size={16} />
            </IconButton>
            <IconButton
              label="Next match"
              shortcut="Enter"
              onClick={onNext}
              disabled={total === 0}
            >
              <ArrowDownIcon size={16} />
            </IconButton>
            <IconButton label="Close" shortcut="Esc" onClick={onClose}>
              <CloseIcon size={16} />
            </IconButton>
          </div>
        </div>

        {showReplace ? (
          <div className="flex items-center gap-1">
            <div className={fieldClass}>
              <input
                value={replaceValue}
                onChange={(event) => onReplaceChange(event.target.value)}
                onKeyDown={handleReplaceKeyDown}
                placeholder="Replace"
                aria-label="Replace"
                spellCheck={false}
                className={inputClass}
              />
            </div>

            <div className="flex shrink-0 items-center gap-0.5 ml-auto">
              <IconButton
                label="Replace"
                shortcut="Enter"
                onClick={onReplaceCurrent}
                disabled={total === 0}
              >
                <ReplaceIcon size={16} />
              </IconButton>
              <IconButton label="Replace all" onClick={onReplaceAll} disabled={total === 0}>
                <ReplaceAllIcon size={16} />
              </IconButton>
              <span className="h-6 w-6" aria-hidden />
            </div>
          </div>
        ) : null}
      </div>
    </search>
  );
}
