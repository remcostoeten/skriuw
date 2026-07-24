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
} from "../shared/icons";
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
      className={active ? "search-widget-button is-active" : "search-widget-button"}
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
    <search aria-label="Find and replace" className="search-widget">
      <button
        type="button"
        aria-label={showReplace ? "Hide replace" : "Show replace"}
        aria-expanded={showReplace}
        onClick={onToggleReplace}
        className="search-widget-expand"
      >
        {showReplace ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
      </button>

      <div className="search-widget-rows">
        <div className="search-widget-row">
          <div className={regexError ? "search-widget-field has-error" : "search-widget-field"}>
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
            />
            <div className="search-widget-toggles">
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
            className={
              noMatches && query.length > 0
                ? "search-widget-count has-error"
                : "search-widget-count"
            }
          >
            {countLabel}
          </span>

          <div className="search-widget-actions">
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
          <div className="search-widget-row">
            <div className="search-widget-field">
              <input
                value={replaceValue}
                onChange={(event) => onReplaceChange(event.target.value)}
                onKeyDown={handleReplaceKeyDown}
                placeholder="Replace"
                aria-label="Replace"
                spellCheck={false}
              />
            </div>

            <span className="search-widget-count" aria-hidden />

            <div className="search-widget-actions">
              <IconButton label="Replace (Enter)" onClick={onReplaceCurrent} disabled={total === 0}>
                <ReplaceIcon size={16} />
              </IconButton>
              <IconButton label="Replace All" onClick={onReplaceAll} disabled={total === 0}>
                <ReplaceAllIcon size={16} />
              </IconButton>
              <span className="search-widget-spacer" aria-hidden />
            </div>
          </div>
        ) : null}
      </div>
    </search>
  );
}
