import { useId, useMemo, useState, type ComponentProps } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { getCommandFrecency, recordCommandUse } from "./command-frecency";
import { SearchIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
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
  /**
   * Explanation shown under the input when the query cannot be answered as
   * typed, e.g. a `#tag` naming nothing or two tags sharing a name.
   */
  notice?: string | null;
  /**
   * The combo the footer advertises for reopening the palette, already
   * formatted. Hosts pass the effective binding so a rebind is reflected here.
   */
  paletteShortcut?: string;
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

export const PALETTE_DIALOG_CLASS =
  "command-palette mx-auto mb-auto mt-[12vh] max-h-[64vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-hidden";

export function CommandPalette({
  open,
  onOpenChange,
  items,
  onQueryChange,
  notice,
  paletteShortcut,
  ...aria
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={aria["aria-label"] ?? "Command palette"}
      showHeader={false}
      className={PALETTE_DIALOG_CLASS}
    >
      <PaletteBody
        items={items}
        onQueryChange={onQueryChange}
        notice={notice ?? null}
        paletteShortcut={paletteShortcut ?? formatShortcut("mod+k")}
      />
    </Dialog>
  );
}

type BodyProps = {
  items: readonly CommandPaletteItem[];
  onQueryChange?: (query: string) => void;
  notice: string | null;
  paletteShortcut: string;
};

function PaletteBody({ items, onQueryChange, notice, paletteShortcut }: BodyProps) {
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const frecency = useMemo(getCommandFrecency, []);
  const closeDialog = useDialogClose();

  const groups = useMemo(
    () => getCommandPaletteGroups(items, query, frecency),
    [items, query, frecency],
  );
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const { activeIndex, listRef, onKeyDown, setActiveIndex } = useListboxNavigation({
    count: flatItems.length,
    onSelect: (index) => {
      const item = flatItems[index];
      if (item) {
        runItem(item);
      }
    },
  });

  function updateQuery(next: string): void {
    setQuery(next);
    setActiveIndex(0);
    onQueryChange?.(parseCommandQuery(next).query);
  }

  function runItem(item: CommandPaletteItem): void {
    recordCommandUse(item.id);
    closeDialog();
    item.action();
  }

  let runningIndex = -1;
  const activeItem = flatItems[activeIndex];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-2.5 border-b border-border px-3.5 py-3 text-muted-foreground">
        <SearchIcon size={16} />
        <input
          autoFocus
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search notes or type a command..."
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? `${listboxId}-item-${activeIndex}` : undefined}
        />
        <Kbd>Esc</Kbd>
      </div>

      {notice && (
        <p
          role="status"
          className="flex-none border-b border-border bg-muted/40 px-3.5 py-2 text-[12px] text-foreground/70"
        >
          {notice}
        </p>
      )}

      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        className="min-h-0 flex-auto overflow-y-auto p-1.5"
      >
        {flatItems.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No results for “{query}”
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.group}>
              <div className={cn("px-2.5 pb-1 pt-2", sectionLabelClass)}>
                {group.group}
              </div>
              {group.items.map((item) => {
                runningIndex += 1;
                const index = runningIndex;
                const isActive = index === activeIndex;

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

      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-3.5 py-2.5 text-[11px] text-muted-foreground">
        <span className="whitespace-nowrap">↑↓ navigate</span>
        <span className="whitespace-nowrap">↵ select</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {COMMAND_BANGS.map((bang) => (
            <span key={bang.key} className="inline-flex items-center gap-1 whitespace-nowrap">
              <Kbd>!{bang.key}</Kbd> {bang.label.toLowerCase()}
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Kbd>#tag</Kbd>
          <Kbd>$person</Kbd> filter
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Kbd>recents</Kbd> recent notes
        </span>
        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap">
          <Kbd>{paletteShortcut}</Kbd> command palette
        </span>
      </div>
    </div>
  );
}
