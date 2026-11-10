import {
  memo,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { getCommandFrecency, recordCommandUse } from "./command-frecency";
import { SearchIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import type { PaletteDensity, PaletteSize } from "./palette-options";
import {
  RECENT_NOTES_GROUP,
  getCommandPaletteGroups,
  getFamilyGroups,
  parseCommandQuery,
  type CommandPaletteGroup,
  type CommandPaletteItem,
} from "./command-palette-model";
import type { PalettePreview } from "./palette-preview";
import { PalettePreviewPane } from "./palette-preview-pane";
import { paletteShortcutLabel } from "./palette-shortcut-label";
import {
  ALL_SCOPE,
  PALETTE_SCOPES,
  RECENTS_SCOPE,
  consumeScopePrefix,
  cycleScope,
  scopeCounts,
  scopedQuery,
  typedScope,
} from "./palette-scopes";

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
  previewFor?: (item: CommandPaletteItem) => PalettePreview | null;
  density?: PaletteDensity;
  size?: PaletteSize;
  "aria-label"?: string;
};

const ROW_HEIGHT: Record<PaletteDensity, string> = {
  compact: "h-7",
  normal: "h-[34px]",
  spacious: "h-10",
};

const INLINE_HINT_LIMIT = 28;

const ENTER_VERBS: ReadonlyMap<string, string> = new Map([
  ["Notes", "Open note"],
  ["Content", "Open note"],
  [RECENT_NOTES_GROUP, "Open note"],
  ["Tags", "Go to tags"],
  ["People", "Go to people"],
  ["Navigation", "Go"],
]);

export const PALETTE_DIALOG_CLASS =
  "command-palette w-[calc(100vw-1.5rem)] max-w-(--palette-max-width) overflow-hidden";

const PALETTE_SIZE_CLASS: Record<PaletteSize, string> = {
  default: "",
  roomy: "command-palette-roomy",
  large: "command-palette-large",
};

/**
 * Dependency-free command palette dialog. Callers own the open state and pass
 * plain-data items; grouping, fuzzy ranking, bang scoping, and frecency-based
 * "Recent" surfacing come from the palette model. Mounts fresh on every open
 * so query and selection always start clean.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  onQueryChange,
  notice,
  paletteShortcut,
  previewFor,
  density = "normal",
  size = "default",
  ...aria
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={aria["aria-label"] ?? "Command palette"}
      showHeader={false}
      className={cn(PALETTE_DIALOG_CLASS, PALETTE_SIZE_CLASS[size])}
    >
      <PaletteBody
        items={items}
        onQueryChange={onQueryChange}
        notice={notice ?? null}
        paletteShortcut={paletteShortcut ?? formatShortcut("mod+k")}
        previewFor={previewFor}
        density={density}
      />
    </Dialog>
  );
}

function Key({ children, symbol = false }: { children: ReactNode; symbol?: boolean }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-[5px] bg-foreground/[0.07] px-1.5 leading-none text-muted-foreground",
        symbol ? "font-sans text-[12px]" : "font-mono text-[10px]",
      )}
    >
      {children}
    </kbd>
  );
}

type ScopeTabsProps = {
  active: string;
  counts: ReadonlyMap<string, number> | null;
  onPick: (scope: string) => void;
};

const SCOPE_STRIP_CLASS =
  "scrollbar-none flex flex-none items-center gap-0.5 overflow-x-auto border-b border-border px-2.5 py-1.5";

const SCOPE_TAB_CLASS =
  "palette-scope flex h-6 flex-none cursor-pointer items-center whitespace-nowrap rounded-md border-none px-2 text-[12px]";

function FamilyStrip({ family, onLeave }: { family: string; onLeave: () => void }) {
  return (
    <div className={SCOPE_STRIP_CLASS}>
      <button
        type="button"
        tabIndex={-1}
        className={cn(SCOPE_TAB_CLASS, "bg-foreground/[0.09] text-foreground")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onLeave}
        aria-label={`Leave ${family}`}
      >
        {family}
      </button>
    </div>
  );
}

function ScopeTabs({ active, counts, onPick }: ScopeTabsProps) {
  return (
    <div className={SCOPE_STRIP_CLASS}>
      {PALETTE_SCOPES.map((scope) => {
        const isActive = scope.key === active;
        const count = counts?.get(scope.key) ?? null;
        const slot = scope.token === null ? null : (count ?? scope.token);
        return (
          <button
            key={scope.key}
            type="button"
            tabIndex={-1}
            aria-pressed={isActive}
            className={cn(
              SCOPE_TAB_CLASS,
              isActive
                ? "bg-foreground/[0.09] text-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground",
              !isActive && count === 0 && scope.token !== null && "opacity-45",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(scope.key)}
          >
            {scope.label}
            {slot !== null && (
              <span className="ml-1.5 min-w-[2ch] font-mono text-[10px] tabular-nums opacity-60">
                {slot}
              </span>
            )}
          </button>
        );
      })}
      <span className="ml-auto flex flex-none items-center gap-1.5 pl-3 text-[11px] text-muted-foreground pointer-coarse:hidden">
        <Key>Tab</Key>
      </span>
    </div>
  );
}

type RowProps = {
  item: CommandPaletteItem;
  index: number;
  id: string;
  isActive: boolean;
  density: PaletteDensity;
};

const ResultRow = memo(function ResultRow({ item, index, id, isActive, density }: RowProps) {
  const hint = item.hint ?? item.description;
  const hintFitsRow = Boolean(item.hintSegments) || (hint?.length ?? 0) <= INLINE_HINT_LIMIT;
  return (
    <button
      type="button"
      tabIndex={-1}
      id={id}
      data-index={index}
      role="option"
      aria-selected={isActive}
      className={cn(
        "palette-row flex w-full cursor-pointer items-center gap-2.5 rounded-md border-none px-2.5 text-left text-[13px]",
        ROW_HEIGHT[density],
        isActive ? "bg-foreground/[0.08] text-foreground" : "bg-transparent text-foreground/80",
      )}
    >
      <span
        className={cn(
          "inline-flex w-4 flex-none justify-center",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-none truncate max-w-[70%]">{item.label}</span>
      {hint && (
        <span
          className={cn(
            "min-w-0 truncate text-[11.5px]",
            isActive ? "text-foreground/65" : "text-muted-foreground",
            !hintFitsRow && "min-[900px]:hidden",
          )}
        >
          {item.hintSegments
            ? item.hintSegments.map((segment, position) =>
                segment.matched ? (
                  <mark key={position} className="bg-transparent font-medium text-foreground">
                    {segment.text}
                  </mark>
                ) : (
                  <span key={position}>{segment.text}</span>
                ),
              )
            : hint}
        </span>
      )}
      {item.shortcut && (
        <span
          className={cn(
            "ml-auto flex-none pl-2 font-mono text-[11px]",
            isActive ? "text-foreground/70" : "text-muted-foreground/80",
          )}
        >
          {paletteShortcutLabel(item.shortcut)}
        </span>
      )}
    </button>
  );
});

type EmptyProps = {
  scopeLabel: string | null;
  query: string;
  elsewhere: number;
  onWiden: () => void;
};

const SYNTAX_TIPS = [
  { token: "#tag", label: "notes carrying a tag" },
  { token: "$person", label: "notes mentioning someone" },
  { token: "!n", label: "only notes" },
  { token: "recents", label: "latest edits" },
] as const;

function EmptyResults({ scopeLabel, query, elsewhere, onWiden }: EmptyProps) {
  const place = scopeLabel ? ` in ${scopeLabel}` : "";
  return (
    <div className="palette-empty flex min-h-0 flex-col items-center justify-center px-6 pb-4 text-center">
      <p className="m-0 text-[14px] font-semibold text-foreground">
        {query ? `Nothing${place} for “${query}”` : `Nothing${place} yet`}
      </p>
      {elsewhere > 0 ? (
        <button
          type="button"
          tabIndex={-1}
          className="palette-widen mt-3 flex cursor-pointer items-center gap-2 rounded-md border-none bg-foreground/[0.08] px-2.5 py-1.5 text-[12.5px] text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onWiden}
        >
          Search everywhere
          <span className="text-muted-foreground">
            {elsewhere} {elsewhere === 1 ? "result" : "results"}
          </span>
          <Key symbol>↵</Key>
        </button>
      ) : (
        <p className="m-0 mt-1.5 text-[12.5px] text-muted-foreground">
          Try fewer letters, or narrow the search.
        </p>
      )}
      <dl className="m-0 mt-6 grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-2 text-left text-[12px] text-muted-foreground">
        {SYNTAX_TIPS.map((tip) => (
          <div key={tip.token} className="contents">
            <dt className="justify-self-end">
              <Key>{tip.token}</Key>
            </dt>
            <dd className="m-0">{tip.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type BodyProps = {
  items: readonly CommandPaletteItem[];
  onQueryChange?: (query: string) => void;
  notice: string | null;
  paletteShortcut: string;
  previewFor?: (item: CommandPaletteItem) => PalettePreview | null;
  density: PaletteDensity;
};

function rowIndexAt(event: MouseEvent<HTMLElement>): number | null {
  if (!(event.target instanceof Element)) {
    return null;
  }
  const index = event.target.closest<HTMLElement>("[data-index]")?.dataset.index;
  return index === undefined ? null : Number(index);
}

function groupSummary(group: CommandPaletteGroup): string | null {
  return group.hiddenCount
    ? `${group.items.length} of ${group.items.length + group.hiddenCount}`
    : null;
}

function PaletteBody({
  items,
  onQueryChange,
  notice,
  paletteShortcut,
  previewFor,
  density,
}: BodyProps) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState(ALL_SCOPE);
  const [family, setFamily] = useState<string | null>(null);
  const listboxId = useId();
  const frecency = useMemo(getCommandFrecency, []);
  const closeDialog = useDialogClose();

  const raw = family ? text : scopedQuery(scope, text);
  const activeScope = family ? ALL_SCOPE : typedScope(raw);
  const searchText = family ? text.trim() : parseCommandQuery(raw).query;

  const groups = useMemo(
    () =>
      family ? getFamilyGroups(items, family, raw) : getCommandPaletteGroups(items, raw, frecency),
    [items, family, raw, frecency],
  );
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const counts = useMemo(() => {
    if (family || searchText === "") {
      return null;
    }
    const everything =
      activeScope === ALL_SCOPE ? groups : getCommandPaletteGroups(items, searchText, frecency);
    const recents =
      activeScope === RECENTS_SCOPE
        ? groups
        : getCommandPaletteGroups(items, scopedQuery(RECENTS_SCOPE, searchText), frecency);
    return scopeCounts(everything, recents);
  }, [items, family, searchText, activeScope, groups, frecency]);

  const { activeIndex, listRef, onKeyDown, setActiveIndex } = useListboxNavigation({
    count: flatItems.length,
    onSelect: (index) => {
      const item = flatItems[index];
      if (item) {
        runItem(item);
      }
    },
  });

  const activeItem = flatItems[activeIndex];
  const preview = useMemo(
    () => (activeItem && previewFor ? previewFor(activeItem) : null),
    [activeItem, previewFor],
  );
  const elsewhere = activeScope === ALL_SCOPE ? 0 : (counts?.get(ALL_SCOPE) ?? 0);
  const familyOffer = !family && text === "" ? (activeItem?.family ?? null) : null;

  function updateText(next: string): void {
    const consumed = family ? null : consumeScopePrefix(next);
    const nextScope = consumed?.scope ?? scope;
    const nextText = consumed?.text ?? next;
    setScope(nextScope);
    setText(nextText);
    setActiveIndex(0);
    onQueryChange?.(
      family ? nextText.trim() : parseCommandQuery(scopedQuery(nextScope, nextText)).query,
    );
  }

  function pickScope(next: string): void {
    if (scope === ALL_SCOPE && activeScope !== ALL_SCOPE) {
      setText("");
    }
    setScope(next);
    setActiveIndex(0);
  }

  function openFamily(item: CommandPaletteItem): void {
    const target = item.family;
    if (!target) return;
    setFamily(target);
    const members = items.filter((member) => member.family === target);
    setActiveIndex(
      Math.max(
        members.findIndex((member) => member.id === item.id),
        0,
      ),
    );
  }

  function closeFamily(): void {
    setFamily(null);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === " " && familyOffer && activeItem) {
      event.preventDefault();
      openFamily(activeItem);
      return;
    }
    if (event.key === "Backspace" && text === "" && family) {
      event.preventDefault();
      closeFamily();
      return;
    }
    if (event.key === "Backspace" && text === "" && scope !== ALL_SCOPE) {
      event.preventDefault();
      pickScope(ALL_SCOPE);
      return;
    }
    if (event.key === "Tab" && !family) {
      event.preventDefault();
      pickScope(cycleScope(activeScope, event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key === "Enter" && flatItems.length === 0 && elsewhere > 0) {
      event.preventDefault();
      pickScope(ALL_SCOPE);
      return;
    }
    onKeyDown(event);
  }

  function runItem(item: CommandPaletteItem): void {
    recordCommandUse(item.id);
    closeDialog();
    item.action();
  }

  function handleListMouseMove(event: MouseEvent<HTMLElement>): void {
    const index = rowIndexAt(event);
    if (index !== null && index !== activeIndex) {
      setActiveIndex(index);
    }
  }

  function handleListClick(event: MouseEvent<HTMLElement>): void {
    const index = rowIndexAt(event);
    const item = index === null ? undefined : flatItems[index];
    if (item) {
      runItem(item);
    }
  }

  const scopeLabel = family
    ? family
    : activeScope === ALL_SCOPE
      ? null
      : (PALETTE_SCOPES.find((candidate) => candidate.key === activeScope)?.label ?? null);
  let runningIndex = -1;

  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div className="flex h-[52px] flex-none items-center gap-3 border-b border-border px-4 text-muted-foreground">
        <SearchIcon size={16} />
        <input
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          value={text}
          onChange={(event) => updateText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            family
              ? `Filter ${family.toLowerCase()}...`
              : scopeLabel
                ? `Search ${scopeLabel.toLowerCase()}...`
                : "Search notes or type a command..."
          }
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? `${listboxId}-item-${activeIndex}` : undefined}
        />
      </div>

      {family ? (
        <FamilyStrip family={family} onLeave={closeFamily} />
      ) : (
        <ScopeTabs active={activeScope} counts={counts} onPick={pickScope} />
      )}

      {notice && (
        <p
          role="status"
          className="m-0 flex-none border-b border-border bg-foreground/[0.03] px-4 py-2 text-[12px] text-foreground/70"
        >
          {notice}
        </p>
      )}

      <p role="status" className="sr-only">
        {`${scopeLabel ?? "All"}, ${flatItems.length} ${flatItems.length === 1 ? "result" : "results"}`}
      </p>

      <div className="palette-panes grid min-h-0 flex-auto grid-cols-1">
        {/* The listbox stays mounted when empty so `aria-controls` always resolves. */}
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Results"
          className={cn(
            "palette-list scrollbar-none min-h-0 overflow-y-auto px-1.5 pb-5",
            flatItems.length === 0 && "hidden",
          )}
          onMouseMove={handleListMouseMove}
          onClick={handleListClick}
        >
          {groups.map((group) => (
            <div key={group.group} role="group" aria-label={group.group}>
              <div className="palette-group sticky top-0 z-1 flex items-baseline gap-1.5 bg-popover px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-muted-foreground">
                {group.group}
                {groupSummary(group) && (
                  <span className="font-normal opacity-70">{groupSummary(group)}</span>
                )}
              </div>
              {group.items.map((item) => {
                runningIndex += 1;
                return (
                  <ResultRow
                    key={item.id}
                    item={item}
                    index={runningIndex}
                    id={`${listboxId}-item-${runningIndex}`}
                    isActive={runningIndex === activeIndex}
                    density={density}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {activeItem ? (
          <PalettePreviewPane item={activeItem} preview={preview} />
        ) : (
          <EmptyResults
            scopeLabel={scopeLabel}
            query={searchText}
            elsewhere={elsewhere}
            onWiden={() => pickScope(ALL_SCOPE)}
          />
        )}
      </div>

      <div className="flex h-9 flex-none items-center gap-4 border-t border-border px-4 text-[11.5px] leading-none text-muted-foreground pointer-coarse:hidden">
        {activeItem && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground/80">
            <Key symbol>↵</Key> {ENTER_VERBS.get(activeItem.group ?? "") ?? "Run"}
          </span>
        )}
        {familyOffer && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Key>Space</Key> {familyOffer}
          </span>
        )}
        {(family || scope !== ALL_SCOPE) && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Key symbol>⌫</Key> {family ? "Back" : "All"}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap">
          <Key>#tag</Key>
          <Key>$person</Key> filter
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Key>{paletteShortcut}</Key> palette
        </span>
      </div>
    </div>
  );
}
