import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { getCommandFrecency, recordCommandUse } from "../lib/command-frecency";
import { SearchIcon } from "../icons";
import {
  COMMAND_BANGS,
  getCommandPaletteGroups,
  parseCommandQuery,
  type CommandPaletteItem,
} from "./command-palette-model";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly CommandPaletteItem[];
  /**
   * Fires with the bang-stripped search text on every keystroke so hosts can
   * feed asynchronous results (e.g. full-text search) back in through `items`.
   */
  onQueryChange?: (query: string) => void;
  "aria-label"?: string;
};

/**
 * Dependency-free command palette dialog. Callers own the open state and pass
 * plain-data items; grouping, fuzzy ranking, bang scoping, and frecency-based
 * "Recent" surfacing come from the palette model. Mounts fresh on every open
 * so query and selection always start clean.
 */
export function CommandPalette({ open, onOpenChange, items, onQueryChange, ...aria }: Props) {
  if (!open) {
    return null;
  }
  return (
    <PaletteDialog
      items={items}
      onQueryChange={onQueryChange}
      onClose={() => onOpenChange(false)}
      aria-label={aria["aria-label"] ?? "Command palette"}
    />
  );
}

type DialogProps = {
  items: readonly CommandPaletteItem[];
  onQueryChange?: (query: string) => void;
  onClose: () => void;
  "aria-label": string;
};

function PaletteDialog({ items, onQueryChange, onClose, ...aria }: DialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const frecency = useMemo(getCommandFrecency, []);

  const groups = useMemo(
    () => getCommandPaletteGroups(items, query, frecency),
    [items, query, frecency],
  );
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const boundedIndex = Math.min(activeIndex, Math.max(flatItems.length - 1, 0));

  useEffect(() => {
    const activeElement = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${boundedIndex}"]`,
    );
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [boundedIndex]);

  function updateQuery(next: string): void {
    setQuery(next);
    setActiveIndex(0);
    onQueryChange?.(parseCommandQuery(next).query);
  }

  function runItem(item: CommandPaletteItem): void {
    recordCommandUse(item.id);
    onClose();
    item.action();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(flatItems.length > 0 ? Math.min(boundedIndex + 1, flatItems.length - 1) : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(boundedIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const activeItem = flatItems[boundedIndex];
      if (activeItem) {
        runItem(activeItem);
      }
    }
  }

  let runningIndex = -1;
  const activeItem = flatItems[boundedIndex];

  return (
    <div className="command-palette-overlay" onPointerDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={aria["aria-label"]}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="command-palette-header">
          <SearchIcon size={16} />
          <input
            autoFocus
            className="command-palette-input"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search notes or type a command..."
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `${listboxId}-item-${boundedIndex}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>

        <div ref={listRef} id={listboxId} role="listbox" className="command-palette-list">
          {flatItems.length === 0 ? (
            <div className="command-palette-empty">No results for “{query}”</div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
                <div className="command-palette-group-label">{group.group}</div>
                {group.items.map((item) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const isActive = index === boundedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`${listboxId}-item-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isActive}
                      className={`command-palette-item${isActive ? " is-active" : ""}`}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => runItem(item)}
                    >
                      <span className="command-palette-item-icon">{item.icon}</span>
                      <span className="command-palette-item-label">{item.label}</span>
                      {(item.hint ?? item.description) && (
                        <span className="command-palette-item-hint">
                          {item.hint ?? item.description}
                        </span>
                      )}
                      <span className="command-palette-item-meta">
                        {item.shortcut && <kbd>{formatShortcut(item.shortcut)}</kbd>}
                        {isActive && <kbd aria-hidden="true">↵</kbd>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span className="command-palette-footer-bangs">
            {Object.entries(COMMAND_BANGS).map(([key, bang]) => (
              <span key={key}>
                <kbd>!{key}</kbd> {bang.label.toLowerCase()}
              </span>
            ))}
          </span>
          <span className="command-palette-footer-end">
            <kbd>{formatShortcut("mod+k")}</kbd> command palette
          </span>
        </div>
      </div>
    </div>
  );
}
