"use client"

import { forwardRef } from "react"
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Regex,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
} from "lucide-react"
import type { SearchOptions } from "@/lib/search-plugin"
import { cn } from "@/lib/utils"

type SearchWidgetProps = {
  query: string
  onQueryChange: (value: string) => void
  replaceValue: string
  onReplaceChange: (value: string) => void
  showReplace: boolean
  onToggleReplace: () => void
  options: SearchOptions
  onToggleOption: (key: keyof SearchOptions) => void
  current: number
  total: number
  regexError: boolean
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-[4px] text-[color:var(--muted-foreground)] transition-colors",
        "hover:bg-[var(--search-hover)] hover:text-[color:var(--foreground)]",
        "disabled:pointer-events-none disabled:opacity-40",
        active &&
          "bg-[var(--search-toggle-active)] text-[color:var(--search-toggle-active-fg)] shadow-[inset_0_0_0_1px_var(--search-toggle-active-border)] hover:bg-[var(--search-toggle-active)] hover:text-[color:var(--search-toggle-active-fg)]",
      )}
    >
      {children}
    </button>
  )
}

export const SearchWidget = forwardRef<HTMLInputElement, SearchWidgetProps>(
  function SearchWidget(
    {
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
    },
    ref,
  ) {
    const countLabel = regexError
      ? "Invalid regex"
      : query.length === 0
        ? ""
        : total === 0
          ? "No results"
          : `${current + 1} of ${total}`

    const noMatches = total === 0

    function handleFindKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Enter") {
        event.preventDefault()
        if (event.shiftKey) onPrevious()
        else onNext()
      } else if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }

    return (
      <div
        role="search"
        aria-label="Find and replace"
        className={cn(
          "flex w-[min(92vw,420px)] items-stretch gap-1 rounded-md border p-1.5 text-[13px] shadow-2xl backdrop-blur-sm",
          "border-[color:var(--search-widget-border)] bg-[var(--search-widget)]",
        )}
      >
        {/* expand / collapse replace row */}
        <button
          type="button"
          aria-label={showReplace ? "Hide replace" : "Show replace"}
          title={showReplace ? "Hide replace" : "Show replace"}
          aria-expanded={showReplace}
          onClick={onToggleReplace}
          className="flex w-5 items-center justify-center rounded-[4px] text-[color:var(--muted-foreground)] transition-colors hover:bg-[var(--search-hover)] hover:text-[color:var(--foreground)]"
        >
          {showReplace ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* ---- Find row ---- */}
          <div className="flex items-center gap-1">
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center rounded-[4px] border bg-[var(--search-field)] pl-2",
                regexError
                  ? "border-[color:var(--destructive)]"
                  : "border-[color:var(--search-field-border)] focus-within:border-[color:var(--search-focus)]",
              )}
            >
              <input
                ref={ref}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={handleFindKeyDown}
                placeholder="Find"
                aria-label="Find"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted-foreground)]"
              />
              <div className="flex items-center gap-0.5 pr-0.5 pl-1">
                <IconButton
                  label="Match Case (Alt+C)"
                  active={options.caseSensitive}
                  onClick={() => onToggleOption("caseSensitive")}
                >
                  <CaseSensitive className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Match Whole Word (Alt+W)"
                  active={options.wholeWord}
                  onClick={() => onToggleOption("wholeWord")}
                >
                  <WholeWord className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Use Regular Expression (Alt+R)"
                  active={options.regex}
                  onClick={() => onToggleOption("regex")}
                >
                  <Regex className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            <span
              className={cn(
                "min-w-[64px] shrink-0 text-right text-[12px] tabular-nums",
                noMatches && query.length > 0
                  ? "text-[color:var(--destructive)]"
                  : "text-[color:var(--muted-foreground)]",
              )}
            >
              {countLabel}
            </span>

            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton label="Previous Match (Shift+Enter)" onClick={onPrevious} disabled={total === 0}>
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton label="Next Match (Enter)" onClick={onNext} disabled={total === 0}>
                <ArrowDown className="h-4 w-4" />
              </IconButton>
              <IconButton label="Close (Esc)" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          {/* ---- Replace row ---- */}
          {showReplace && (
            <div className="flex items-center gap-1">
              <div className="flex min-w-0 flex-1 items-center rounded-[4px] border border-[color:var(--search-field-border)] bg-[var(--search-field)] pl-2 focus-within:border-[color:var(--search-focus)]">
                <input
                  value={replaceValue}
                  onChange={(event) => onReplaceChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      onReplaceCurrent()
                    } else if (event.key === "Escape") {
                      event.preventDefault()
                      onClose()
                    }
                  }}
                  placeholder="Replace"
                  aria-label="Replace"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted-foreground)]"
                />
              </div>

              {/* spacer to align with count column */}
              <span className="min-w-[64px] shrink-0" aria-hidden />

              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton label="Replace (Enter)" onClick={onReplaceCurrent} disabled={total === 0}>
                  <Replace className="h-4 w-4" />
                </IconButton>
                <IconButton label="Replace All" onClick={onReplaceAll} disabled={total === 0}>
                  <ReplaceAll className="h-4 w-4" />
                </IconButton>
                {/* keep alignment with the close button on the find row */}
                <span className="h-6 w-6" aria-hidden />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  },
)
