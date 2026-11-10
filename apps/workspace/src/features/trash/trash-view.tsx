import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { parseDateKey } from "@skriuw/renderer-core/journal/dates";
import { filterTrashRows, sortTrashRows, trashRows } from "@skriuw/renderer-core/store/trash";
import type { TrashSortKey } from "@skriuw/renderer-core/store/trash";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { emptyTrash, purgeSubtree, restoreSubtree } from "@/features/notes/operations";
import { isTypingTarget } from "@/features/tasks/keyboard";
import { COMPACT_EMPTY_STATE_STYLE, EMPTY_STATE_COLORS } from "@/shared/empty-state/app-theme";
import { EmptyState } from "@/shared/empty-state/empty-state";
import { SearchIllustration, TrashIllustration } from "@/shared/empty-state/illustrations";
import { useToday } from "@/shared/format/use-today";
import { SearchIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { Select, type SelectOption } from "@/shared/ui/select";
import { settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import { WindowControlsSlot } from "@/shared/ui/window-controls-slot";
import { groupTrashRows, trashNeighborId } from "./model";
import { TrashGroupSection, type TrashRowActions, type TrashViewport } from "./trash-group";

type Props = {
  store: RendererStore;
};

const SORT_OPTIONS: readonly SelectOption<TrashSortKey>[] = [
  { value: "newest", label: "Recently deleted" },
  { value: "oldest", label: "Deleted first" },
  { value: "az", label: "Title A–Z" },
  { value: "za", label: "Title Z–A" },
];

const kbdClass =
  "rounded-[5px] border border-theme-divider/85 bg-theme-hover/55 px-[5px] font-mono text-[10px] leading-[1.5] text-theme-secondary";

function selectSourceNodes(state: RendererState) {
  return state.sourceNodes;
}

function selectDocuments(state: RendererState) {
  return state.documents;
}

function rowElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-trash-row="${CSS.escape(id)}"]`);
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={kbdClass}>{children}</kbd>;
}

export function TrashView({ store }: Props) {
  const today = useToday();
  const sourceNodes = useRendererSelector(store, selectSourceNodes);
  const documents = useRendererSelector(store, selectDocuments);
  const rows = useMemo(() => trashRows(sourceNodes, documents), [documents, sourceNodes]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<TrashSortKey>("newest");
  const [emptyArmed, setEmptyArmed] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [viewport, setViewport] = useState<TrashViewport>({ height: 720, scrollTop: 0 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const groups = useMemo(
    () =>
      groupTrashRows(
        sortTrashRows(filterTrashRows(rows, query), sortKey),
        sortKey,
        parseDateKey(today).getTime(),
      ),
    [query, rows, sortKey, today],
  );
  const ids = useMemo(() => groups.flatMap((group) => group.rows.map((row) => row.id)), [groups]);
  const tabStopId = focusedId !== null && ids.includes(focusedId) ? focusedId : (ids[0] ?? null);
  const searching = query.trim().length > 0;

  useLayoutEffect(() => {
    const mounted = scrollerRef.current;
    if (!mounted) return;
    const element: HTMLElement = mounted;
    function updateHeight(): void {
      setViewport((current) => ({ ...current, height: element.clientHeight }));
    }
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const id = pendingFocusRef.current;
    if (id === null) return;
    if (!ids.includes(id)) {
      pendingFocusRef.current = null;
      return;
    }
    const target = rowElement(id);
    if (!target) return;
    pendingFocusRef.current = null;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  });

  function focusRow(id: string): void {
    const target = rowElement(id);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    pendingFocusRef.current = id;
    scroller.scrollTop = id === ids[0] ? 0 : scroller.scrollHeight;
  }

  function handOffFocus(id: string): void {
    if (rowElement(id)?.contains(document.activeElement)) {
      pendingFocusRef.current = trashNeighborId(ids, id);
    }
  }

  const actions: TrashRowActions = {
    restore: (id) => {
      handOffFocus(id);
      restoreSubtree(store, id);
    },
    purge: (id) => {
      handOffFocus(id);
      purgeSubtree(store, id);
    },
  };

  function confirmEmpty(): void {
    emptyTrash(
      store,
      rows.map((row) => row.id),
    );
    setEmptyArmed(false);
  }

  function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!(event.target instanceof HTMLElement)) return;
    const current = event.target.closest<HTMLElement>("[data-trash-row]")?.dataset.trashRow;
    if (current === undefined) return;
    const index = ids.indexOf(current);
    const down = event.key === "ArrowDown";
    const next = event.shiftKey ? (down ? ids.at(-1) : ids[0]) : ids[index + (down ? 1 : -1)];
    event.preventDefault();
    if (next !== undefined) focusRow(next);
  }

  function onPageKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target) || rows.length === 0) return;
    event.preventDefault();
    searchRef.current?.focus();
  }

  const summaryText =
    rows.length === 0
      ? "Nothing deleted."
      : searching
        ? `${ids.length} of ${rows.length} match`
        : `${rows.length} ${rows.length === 1 ? "item" : "items"} · kept until you delete them forever`;

  return (
    <main
      className="relative col-[2/-1] flex min-h-0 min-w-0 flex-col bg-theme-editor"
      aria-labelledby="trash-title"
      onKeyDown={onPageKeyDown}
    >
      <header
        className={cn(
          "relative flex h-[52px] flex-none items-center border-b px-10 transition-[border-color] duration-150 max-[860px]:px-5",
          scrolled ? "border-theme-divider" : "border-transparent",
        )}
      >
        <div className="mx-auto flex w-full max-w-[900px] min-w-0 items-center gap-3">
          <h1
            id="trash-title"
            className="m-0 text-[15px] font-medium tracking-[-0.01em] text-foreground"
          >
            Trash
          </h1>
          <p
            aria-live="polite"
            className="m-0 min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-theme-secondary"
          >
            {summaryText}
          </p>
          {rows.length > 0 && (
            <>
              {!emptyArmed && (
                <>
                  <div className="group relative w-[200px] flex-none max-[860px]:w-[150px]">
                    <SearchIcon
                      size={13}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-theme-secondary transition-colors duration-150 group-focus-within:text-foreground"
                    />
                    <input
                      ref={searchRef}
                      type="search"
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      className="h-8 w-full rounded-lg border border-border bg-background py-0 pr-[30px] pl-[29px] text-[12.5px] text-foreground outline-0 transition-[border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] placeholder:text-theme-dim hover:border-theme-btn-outline focus-visible:border-ring [&::-webkit-search-cancel-button]:hidden"
                      placeholder="Search trash"
                      aria-label="Search trash"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setQuery("");
                        } else if (event.key === "ArrowDown" || event.key === "Enter") {
                          event.preventDefault();
                          const first = ids[0];
                          if (first !== undefined) focusRow(first);
                        }
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 right-[7px] flex -translate-y-1/2 transition-opacity duration-150 group-focus-within:opacity-0"
                    >
                      <Kbd>/</Kbd>
                    </span>
                  </div>
                  <Select
                    label="Sort deleted items"
                    prefix="Sort"
                    align="end"
                    value={sortKey}
                    options={SORT_OPTIONS}
                    onChange={setSortKey}
                    triggerClassName="min-h-8 border-transparent bg-transparent text-[12.5px] text-theme-secondary hover:bg-theme-hover data-[open=true]:bg-theme-hover"
                  />
                </>
              )}
              <InlineConfirm
                className="shrink-0"
                armed={emptyArmed}
                onArmedChange={setEmptyArmed}
                confirmLabel={`Delete ${rows.length} ${rows.length === 1 ? "item" : "items"} forever`}
                cancelLabel="Keep them"
                message="This cannot be undone."
                onConfirm={confirmEmpty}
                renderIdle={(arm) => (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center rounded-lg border-0 bg-transparent px-2.5 text-[12.5px] text-theme-secondary outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive",
                      settingsTransition,
                      settingsPress,
                    )}
                    onClick={arm}
                  >
                    Empty trash
                  </button>
                )}
              />
            </>
          )}
        </div>
        <WindowControlsSlot className="absolute top-0 right-0" />
      </header>

      <div
        ref={scrollerRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-10 pb-[72px] [scrollbar-width:thin] max-[860px]:px-5"
        onScroll={(event) => {
          const scrollTop = event.currentTarget.scrollTop;
          setScrolled(scrollTop > 0);
          setViewport((current) => ({ ...current, scrollTop }));
        }}
        onFocus={(event) => {
          const id = event.target.closest<HTMLElement>("[data-trash-row]")?.dataset.trashRow;
          if (id !== undefined) setFocusedId(id);
        }}
        onKeyDown={onListKeyDown}
      >
        {rows.length === 0 ? (
          <div className="grid h-full place-items-center pb-20">
            <EmptyState
              colors={EMPTY_STATE_COLORS}
              illustration={<TrashIllustration />}
              title="Trash is empty"
              description="Notes and folders you delete stay here until you remove them for good. Restoring one puts it back in its folder."
            />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            colors={EMPTY_STATE_COLORS}
            style={COMPACT_EMPTY_STATE_STYLE}
            illustration={<SearchIllustration />}
            title={`Nothing in trash matches “${query.trim()}”`}
            description={
              <>
                Titles, folders and note text are searched. <Kbd>Esc</Kbd> clears the search.
              </>
            }
          />
        ) : (
          <div className="mx-auto max-w-[900px]">
            {groups.map((group) => (
              <TrashGroupSection
                key={group.id}
                group={group}
                viewport={viewport}
                tabStopId={tabStopId}
                actions={actions}
              />
            ))}
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-[5px] border-t border-theme-divider/85 pt-3.5 pl-[196px] text-[10.5px] whitespace-nowrap text-theme-dim max-[860px]:pl-0">
              <span>
                <Kbd>/</Kbd> Search
              </span>
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> Move
              </span>
              <span>
                <Kbd>R</Kbd> Restore
              </span>
              <span>
                <Kbd>Del</Kbd> Delete forever
              </span>
              <span className="sr-only">
                Shift with Up or Down jumps to the first or last item.
              </span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
