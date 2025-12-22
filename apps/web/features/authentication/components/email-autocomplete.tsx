'use client'

import { cn } from "@skriuw/shared";
import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from "react";

const DOMAIN_SUGGESTIONS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function EmailAutocomplete({
  value,
  onChange,
  placeholder = "Enter your email",
  className,
  id = "email-input",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [filteredDomains, setFilteredDomains] = useState<string[]>([]);
  const [inlineSuggestion, setInlineSuggestion] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = `${id}-listbox`;

  // Extract the part after @ for filtering
  const getLocalAndDomain = useCallback((email: string) => {
    const atIndex = email.indexOf("@");
    if (atIndex === -1) return { local: email, domain: "" };
    return {
      local: email.substring(0, atIndex),
      domain: email.substring(atIndex + 1),
    };
  }, []);

  // Update suggestions when value changes
  useEffect(() => {
    const { local, domain } = getLocalAndDomain(value);
    const hasAt = value.includes("@");

    if (hasAt && local.length > 0) {
      // Filter domains based on what user typed after @
      const filtered = DOMAIN_SUGGESTIONS.filter((d) =>
        d.toLowerCase().startsWith(domain.toLowerCase())
      );
      setFilteredDomains(filtered);
      setIsOpen(filtered.length > 0);

      // Set inline suggestion (ghost text)
      if (filtered.length > 0 && domain.length < filtered[0].length) {
        const remaining = filtered[0].substring(domain.length);
        setInlineSuggestion(remaining);
      } else {
        setInlineSuggestion("");
      }
    } else {
      setFilteredDomains([]);
      setIsOpen(false);
      setInlineSuggestion("");
    }

    // Reset active index when suggestions change
    setActiveIndex(-1);
  }, [value, getLocalAndDomain]);

  // Accept the inline suggestion
  const acceptInlineSuggestion = useCallback(() => {
    if (inlineSuggestion) {
      onChange(value + inlineSuggestion);
      setInlineSuggestion("");
      setIsOpen(false);
    }
  }, [inlineSuggestion, value, onChange]);

  // Select a domain from the dropdown
  const selectDomain = useCallback(
    (domain: string) => {
      const { local } = getLocalAndDomain(value);
      onChange(`${local}@${domain}`);
      setIsOpen(false);
      setInlineSuggestion("");
      inputRef.current?.focus();
    },
    [value, onChange, getLocalAndDomain]
  );

  // Handle keyboard navigation
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        if (isOpen && filteredDomains.length > 0) {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < filteredDomains.length - 1 ? prev + 1 : 0
          );
        }
        break;

      case "ArrowUp":
        if (isOpen && filteredDomains.length > 0) {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : filteredDomains.length - 1
          );
        }
        break;

      case "Enter":
        if (isOpen && activeIndex >= 0 && filteredDomains[activeIndex]) {
          e.preventDefault();
          selectDomain(filteredDomains[activeIndex]);
        }
        break;

      case "Tab":
      case "ArrowRight":
        if (inlineSuggestion) {
          e.preventDefault();
          acceptInlineSuggestion();
        }
        break;

      case "Escape":
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
        }
        break;
    }
  };

  // Handle input change
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  };

  // Handle blur - close dropdown with delay to allow click
  function handleBlur() {
    setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
    }, 150);
  };

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex >= 0 && listboxRef.current) {
      const activeOption = listboxRef.current.children[activeIndex] as HTMLElement;
      activeOption?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div className="relative w-full">
      {/* Combobox wrapper with proper ARIA */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-owns={listboxId}
        className="relative"
      >
        {/* Input container for ghost text overlay */}
        <div className="relative">
          {/* Ghost text layer (inline suggestion) */}
          {inlineSuggestion && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center pointer-events-none"
            >
              <span className="h-12 px-4 flex items-center text-sm">
                {/* Invisible text to position the ghost */}
                <span className="invisible">{value}</span>
                {/* Ghost suggestion */}
                <span className="text-muted-foreground/50">{inlineSuggestion}</span>
              </span>
            </div>
          )}

          {/* Actual input */}
          <input
            ref={inputRef}
            type="email"
            id={id}
            name="email"
            autoComplete="email"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
            aria-autocomplete="both"
            aria-controls={listboxId}
            aria-activedescendant={
              activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
            }
            className={cn(
              "flex h-12 w-full rounded-md border border-border bg-background px-4 py-2 text-base md:text-sm",
              "ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "text-foreground",
              className
            )}
          />
        </div>

        {/* Dropdown listbox */}
        {isOpen && filteredDomains.length > 0 && (
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label="Email domain suggestions"
            className={cn(
              "absolute z-50 mt-1 w-full rounded-md border border-border",
              "bg-popover text-popover-foreground shadow-md",
              "max-h-60 overflow-auto py-1"
            )}
          >
            {filteredDomains.map((domain, index) => {
              const { local } = getLocalAndDomain(value);
              const isActive = index === activeIndex;

              return (
                <li
                  key={domain}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectDomain(domain)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center px-4 py-2 text-sm",
                    "transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <span className="text-muted-foreground">{local}@</span>
                  <span className="font-medium">{domain}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Screen reader announcement for suggestions */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isOpen && filteredDomains.length > 0 && (
          <span>
            {filteredDomains.length} suggestion{filteredDomains.length !== 1 ? "s" : ""} available.
            Use arrow keys to navigate.
          </span>
        )}
      </div>
    </div>
  );
};

export default EmailAutocomplete;
