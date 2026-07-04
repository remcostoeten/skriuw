import { useEffect, useId, useState } from "react";
import {
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
} from "@blocknote/react";
import { cn } from "@/shared/lib/utils";

export function KeyboardAccessibleSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const menuId = useId();
  const [activeIndex, setActiveIndex] = useState(selectedIndex ?? 0);

  useEffect(() => {
    setActiveIndex(selectedIndex ?? 0);
  }, [selectedIndex, items.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const suggestionMenu = document.getElementById(menuId);
      if (!suggestionMenu || items.length === 0) {
        return;
      }

      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.closest(".blocknote-wrapper")
      ) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % items.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(items.length - 1);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(0);
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[activeIndex];
        if (!item) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onItemClick?.(item);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, items, menuId, onItemClick]);

  useEffect(() => {
    const activeItem = document.getElementById(`${menuId}-item-${activeIndex}`);
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, menuId]);

  if (loadingState === "loading-initial" || loadingState === "loading") {
    return null;
  }

  return (
    <div
      id={menuId}
      role="listbox"
      aria-label="Editor suggestions"
      aria-activedescendant={`${menuId}-item-${activeIndex}`}
      className="bn-suggestion-menu skriuw-editor-suggestion-menu z-[100] max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/40"
    >
      {items.map((item, index) => (
        <button
          key={`${item.title}-${index}`}
          id={`${menuId}-item-${index}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => onItemClick?.(item)}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/50",
            index === activeIndex
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
          )}
        >
          {item.icon ? (
            <span className="mt-0.5 shrink-0 text-muted-foreground">
              {item.icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">
              {item.title}
            </span>
            {item.subtext ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {item.subtext}
              </span>
            ) : null}
          </span>
          {item.badge ? (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
