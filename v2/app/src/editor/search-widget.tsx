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
} from "@/shared/icons";
import { cn } from "@/shared/lib/utils";
import type { SearchOptions } from "./search-plugin";

type Props = {
  ref?: Ref<HTMLInputElement>;
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
  "min-w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground @max-[360px]/editor-search:hidden";

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
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
  );
}

export function SearchWidget({
  ref,
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
      className="flex w-[min(420px,100%)] items-stretch gap-1 rounded-lg border border-border bg-popover p-1.5 text-[13px] text-foreground shadow-[0_12px_28px_-12px_hsl(var(--scrim)/0.32)]"
    >
      <button
        type="button"
        aria-label={showReplace ? "Hide replace" : "Show replace"}
        aria-expanded={showReplace}
        onClick={onToggleReplace}
        className="flex w-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground"
      >
        {showReplace ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
      </button>

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
                label="Match Case (Alt+C)"
                active={options.caseSensitive}
                onClick={() => onToggleOption("caseSensitive")}
              >
                <CaseSensitiveIcon size={16} />
              </IconButton>
              <IconButton
                label="Match Whole Word (Alt+W)"
                active={options.wholeWord}
                onClick={() => onToggleOption("wholeWord")}
              >
                <WholeWordIcon size={16} />
              </IconButton>
              <IconButton
                label="Use Regular Expression (Alt+R)"
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

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label="Previous Match (Shift+Enter)"
              onClick={onPrevious}
              disabled={total === 0}
            >
              <ArrowUpIcon size={16} />
            </IconButton>
            <IconButton label="Next Match (Enter)" onClick={onNext} disabled={total === 0}>
              <ArrowDownIcon size={16} />
            </IconButton>
            <IconButton label="Close (Esc)" onClick={onClose}>
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

            <span className={countClass} aria-hidden />

            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton label="Replace (Enter)" onClick={onReplaceCurrent} disabled={total === 0}>
                <ReplaceIcon size={16} />
              </IconButton>
              <IconButton label="Replace All" onClick={onReplaceAll} disabled={total === 0}>
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
