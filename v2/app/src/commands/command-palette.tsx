import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { getCommandFrecency, recordCommandUse } from "./command-frecency";
import { SearchIcon } from "@/shared/icons/static";
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
function Kbd({ children, ...rest }: ComponentProps<"kbd">) {
  return (
    <kbd
      className="inline-flex flex-none rounded border border-border bg-muted px-[5px] py-px font-mono text-[10px] text-muted-foreground"
      {...rest}
    >
      {children}
    </kbd>
  );
}

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const frecency = useMemo(getCommandFrecency, []);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const handleClose = () => onCloseRef.current();
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target === dialog) {
        dialog.close();
      }
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.showModal();
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

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
    dialogRef.current?.close();
    item.action();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Tab") {
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
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
    <dialog
      ref={dialogRef}
      role="dialog"
      className="command-palette inset-0 mx-auto mb-auto mt-[12vh] flex h-fit max-h-[64vh] w-[calc(100vw-1.5rem)] max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl shadow-black/40 backdrop:bg-black/55 backdrop:backdrop-blur-[1px]"
      aria-label={aria["aria-label"]}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          dialogRef.current?.close();
        }
      }}
    >
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3 text-muted-foreground">
        <SearchIcon size={16} />
        <input
          autoFocus
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
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
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} id={listboxId} role="listbox" className="min-h-0 overflow-y-auto p-1.5">
        {flatItems.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No results for “{query}”
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.group}>
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {group.group}
              </div>
              {group.items.map((item) => {
                runningIndex += 1;
                const index = runningIndex;
                const isActive = index === boundedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    tabIndex={-1}
                    id={`${listboxId}-item-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    className={`relative flex w-full cursor-pointer items-center gap-2.5 rounded-md border-none bg-transparent px-2.5 py-2 text-left text-[13px] transition-colors before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-foreground/70 before:transition-opacity ${
                      isActive
                        ? "bg-foreground/[0.14] text-foreground before:opacity-100"
                        : "text-sidebar-foreground before:opacity-0 hover:bg-sidebar-accent/50"
                    }`}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                  >
                    <span
                      className={`inline-flex w-4 flex-none justify-center ${
                        isActive ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="max-w-[60%] flex-none truncate">{item.label}</span>
                    {(item.hint ?? item.description) && (
                      <span
                        className={`min-w-0 truncate text-[11px] ${
                          isActive ? "text-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {item.hint ?? item.description}
                      </span>
                    )}
                    <span className="ml-auto flex flex-none items-center gap-1.5">
                      {item.shortcut && <Kbd>{formatShortcut(item.shortcut)}</Kbd>}
                      {isActive && <Kbd aria-hidden="true">↵</Kbd>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="whitespace-nowrap">↑↓ navigate</span>
        <span className="whitespace-nowrap">↵ select</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {COMMAND_BANGS.map((bang) => (
            <span key={bang.key} className="inline-flex items-center gap-1 whitespace-nowrap">
              <Kbd>!{bang.key}</Kbd> {bang.label.toLowerCase()}
            </span>
          ))}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap">
          <Kbd>{formatShortcut("mod+k")}</Kbd> command palette
        </span>
      </div>
    </dialog>
  );
}
