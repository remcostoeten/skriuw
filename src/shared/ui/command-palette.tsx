"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Command, Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

export type CommandPaletteItem = {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: string[];
  description?: string;
  action: () => void;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  items: CommandPaletteItem[];
};

export function CommandPalette({
  open,
  onOpenChange,
  title = "Command Palette",
  description = "Run actions without leaving the keyboard.",
  items,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listboxId = useId();
  const inputId = useId();
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) => {
      const haystack = [item.label, item.description, item.shortcut, ...(item.keywords ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [items, query]);

  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(0);
    }
  }, [filteredItems.length, selectedIndex]);

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const runItem = (item: CommandPaletteItem) => {
    triggerNativeFeedback("selection");
    onOpenChange(false);
    item.action();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="native-panel max-h-[80vh] overflow-hidden border-border/70 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:max-w-2xl">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-16 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_70%)]" />
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Command className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/50 px-4 py-3">
          <label
            htmlFor={inputId}
            className="native-surface flex items-center gap-3 rounded-[1.15rem] border border-border/70 px-3 py-3"
          >
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <input
              id={inputId}
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && filteredItems.length > 0) {
                  event.preventDefault();
                  setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
                }

                if (event.key === "ArrowUp" && filteredItems.length > 0) {
                  event.preventDefault();
                  setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
                }

                if (event.key === "Enter" && filteredItems[selectedIndex]) {
                  event.preventDefault();
                  runItem(filteredItems[selectedIndex]);
                }
              }}
              placeholder="Search commands..."
              aria-controls={listboxId}
              aria-activedescendant={
                filteredItems[selectedIndex] ? `${listboxId}-item-${filteredItems[selectedIndex].id}` : undefined
              }
              aria-expanded={open}
              aria-autocomplete="list"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </label>
        </div>

        <div id={listboxId} role="listbox" className="max-h-[52vh] overflow-y-auto px-2 py-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => runItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                role="option"
                aria-selected={index === selectedIndex}
                id={`${listboxId}-item-${item.id}`}
                ref={index === selectedIndex ? selectedItemRef : null}
                className="pressable native-surface flex w-full items-center gap-3 rounded-[1.15rem] border border-transparent px-3 py-3 text-left transition-colors hover:border-border/60 hover:bg-accent/55"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{item.label}</div>
                    {item.description ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    ) : null}
                  </div>
                </div>
                {item.shortcut ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-md border border-border/60 bg-background/80 px-2 py-1",
                      "font-mono text-[11px] text-muted-foreground",
                    )}
                  >
                    {item.shortcut}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No commands match “{query}”.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
