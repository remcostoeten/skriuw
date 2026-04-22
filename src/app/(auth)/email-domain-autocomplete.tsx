"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/utils";

const EMAIL_DOMAIN_SUGGESTIONS = [
  { domain: "gmail.com", label: "Google" },
  { domain: "outlook.com", label: "Microsoft" },
  { domain: "hotmail.com", label: "Microsoft" },
  { domain: "icloud.com", label: "Apple" },
  { domain: "proton.me", label: "Privacy-first" },
  { domain: "yahoo.com", label: "Yahoo" },
  { domain: "live.com", label: "Microsoft" },
  { domain: "msn.com", label: "Microsoft" },
  { domain: "gmx.com", label: "Popular in Europe" },
  { domain: "fastmail.com", label: "Fastmail" },
  { domain: "mail.com", label: "Mail.com" },
  { domain: "zoho.com", label: "Zoho" },
  { domain: "yandex.com", label: "Yandex" },
  { domain: "pm.me", label: "Proton Mail" },
  { domain: "tuta.com", label: "Privacy-first" },
  { domain: "hey.com", label: "Hey" },
  { domain: "aol.com", label: "AOL" },
  { domain: "hotmail.nl", label: "Netherlands" },
  { domain: "live.nl", label: "Netherlands" },
  { domain: "ziggo.nl", label: "Netherlands" },
  { domain: "kpnmail.nl", label: "Netherlands" },
  { domain: "xs4all.nl", label: "Netherlands" },
] as const;

type EmailDomainSuggestion = (typeof EMAIL_DOMAIN_SUGGESTIONS)[number];

type EmailDomainAutocompleteProps = {
  id: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  autoComplete?: string;
};

function getDomainState(value: string) {
  const atIndex = value.lastIndexOf("@");

  if (atIndex < 0) {
    return {
      hasLocalPart: false,
      localPart: value,
      query: "",
    };
  }

  return {
    hasLocalPart: atIndex > 0,
    localPart: value.slice(0, atIndex),
    query: value.slice(atIndex + 1).trim().toLowerCase(),
  };
}

function formatSuggestionLabel(domain: string) {
  return `@${domain}`;
}

export function EmailDomainAutocomplete({
  id,
  value,
  onValueChange,
  placeholder,
  required,
  className,
  autoComplete = "email",
}: EmailDomainAutocompleteProps) {
  const listboxId = useId();
  const hintId = useId();
  const statusId = useId();
  const blurTimerRef = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { hasLocalPart, localPart, query } = useMemo(() => getDomainState(value), [value]);

  const suggestions = useMemo(() => {
    if (!hasLocalPart) {
      return [];
    }

    const normalizedQuery = query;
    return EMAIL_DOMAIN_SUGGESTIONS.filter((suggestion) =>
      suggestion.domain.startsWith(normalizedQuery),
    ).slice(0, 6);
  }, [hasLocalPart, query]);

  const isOpen = isFocused && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const commitSuggestion = (suggestion: EmailDomainSuggestion) => {
    onValueChange(`${localPart}@${suggestion.domain}`);
    setIsFocused(false);
    setActiveIndex(0);
  };

  const handleBlur = () => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
    }

    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      setIsFocused(false);
      setActiveIndex(0);
    }, 120);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === "Escape") {
        setIsFocused(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex] ?? suggestions[0];
      if (suggestion) {
        commitSuggestion(suggestion);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsFocused(false);
      setActiveIndex(0);
    }
  };

  const statusText =
    isOpen && suggestions.length > 0
      ? `${suggestions.length} email domain suggestion${suggestions.length === 1 ? "" : "s"} available. Press Tab to accept the first suggestion.`
      : "Type @ after your name to see common email domains. Use Arrow keys and Enter, or Tab to accept.";

  return (
    <div className="relative">
      <input
        id={id}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        type="email"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setIsFocused(true);
        }}
        onFocus={() => {
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
          }
          setIsFocused(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-describedby={`${hintId} ${statusId}`.trim()}
        className={className}
      />

      <p id={hintId} className="sr-only">
        Type @ to open email domain suggestions. Arrow keys move through options, Enter accepts
        the selected option, and Tab accepts the first suggestion.
      </p>
      <p id={statusId} className="sr-only" aria-live="polite" aria-atomic="true">
        {statusText}
      </p>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden border border-border bg-card shadow-[0_24px_60px_rgba(0,0,0,0.42)]">
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">
            <span>Domain suggestions</span>
            <span>Tab to accept</span>
          </div>

          {suggestions.length > 0 ? (
            <div role="listbox" aria-label="Email domain suggestions" className="max-h-64 overflow-y-auto p-1.5">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.domain}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commitSuggestion(suggestion)}
                  className={cn(
                    "flex w-full items-center gap-3 border border-transparent px-3 py-2.5 text-left transition-colors",
                    index === activeIndex
                      ? "border-border bg-muted text-foreground"
                      : "text-foreground/75 hover:border-border hover:bg-muted",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-background font-mono text-[11px] text-muted-foreground/80">
                    @
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {formatSuggestionLabel(suggestion.domain)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggestion.label}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No matching domains yet. Keep typing or try a common provider like Gmail or Proton.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
