import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useShortcutBinding } from "@remcostoeten/use-shortcut/react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import {
  activateNote,
  commitOperations,
  commitReferenceOperations,
} from "@/store/actions/workspace";
import { useRouteFocus } from "@/app-route";
import { appRouteHash, entityFocusHash } from "@skriuw/renderer-core/route/app-route";
import { WindowControls } from "@/shell/window-controls";
import {
  buildCreatePerson,
  buildCreateTag,
  buildDelete,
  buildRecolor,
  buildRename,
  deriveInitials,
  entityNoun,
  entityNounPlural,
  entityRowsEqual,
  projectEntities,
  summarizeEntities,
  type EntityKind,
  type EntityRow,
} from "./entity-manager-model";
import {
  entityDetailEqual,
  projectEntityDetail,
  type EntityDetail,
  type RelatedEntity,
} from "./entity-detail-model";
import { buildMergeSaveDocuments } from "./entity-merge";
import { registerEntityCreate } from "./entity-create-controller";
import { ColorSwatchRow } from "./color-swatch-row";
import {
  CheckIcon,
  ChevronLeftIcon,
  FileTextIcon,
  HashIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
  WaypointsIcon,
} from "@/shared/icons/static";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { effectiveShortcutKeys, shortcutDefinition } from "@/commands/bindings";
import { sameOverrides, selectShortcutOverrides } from "@/features/settings/sections/selectors";
import { Button, buttonVariants } from "@/shared/ui/button";
import { HoldToConfirm } from "@/shared/ui/hold-to-confirm";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { COARSE_POINTER_QUERY } from "@/shell/panel-layout";
import { InlineEdit } from "@/shared/ui/inline-edit";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { Select, type SelectOption } from "@/shared/ui/select";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { cn } from "@/shared/lib/utils";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";

const swatchBaseClass =
  "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-[0.02em] text-background transition-[background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-empty:border data-empty:border-dashed data-empty:border-border data-empty:bg-transparent data-empty:text-theme-dim";
const rowSwatchClass = cn(swatchBaseClass, "h-[22px] w-[22px] text-[9px]");
const heroSwatchClass = cn(swatchBaseClass, "h-11 w-11 text-[14px]");
const chipSwatchClass = cn(swatchBaseClass, "h-[14px] w-[14px] text-[7px]");
const focusRingClass = "focus-visible:bg-muted focus-visible:text-foreground";
const inlinePressClass =
  "transition-transform duration-[140ms] ease-out enabled:active:scale-[0.97]";
/** Anchored to the list rather than centred, so the pane reads as its detail. */
const detailColumnClass = "w-full max-w-[min(100%,680px)] px-[clamp(20px,3.5vw,40px)]";

type Props = {
  store: RendererStore;
  kind: EntityKind;
};

type SortMode = "name" | "recent" | "used";

const SORT_OPTIONS: readonly SelectOption<SortMode>[] = [
  { value: "used", label: "Most used" },
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently created" },
];

const SORT_GROUP_LABEL: Record<SortMode, string> = {
  used: "Most used",
  name: "All",
  recent: "Recently created",
};

function sortRows(rows: readonly EntityRow[], sort: SortMode): EntityRow[] {
  const sorted = [...rows];
  if (sort === "recent") {
    sorted.sort(
      (left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name),
    );
  } else if (sort === "used") {
    sorted.sort(
      (left, right) => right.noteCount - left.noteCount || left.name.localeCompare(right.name),
    );
  } else {
    sorted.sort((left, right) => left.name.localeCompare(right.name));
  }
  return sorted;
}

function filterRows(rows: readonly EntityRow[], query: string): EntityRow[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return [...rows];
  }
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(trimmed) ||
      (row.note !== null && row.note.toLowerCase().includes(trimmed)),
  );
}

type RowGroup = {
  label: string;
  rows: readonly EntityRow[];
  /** Index of this group's first row in the flat list, so arrow keys can cross groups. */
  offset: number;
};

/**
 * Splits the list so entities nothing references stop reading like the rest.
 * A single group renders without a header, since one label over one list is
 * chrome rather than structure.
 */
function groupRows(rows: readonly EntityRow[], sort: SortMode): RowGroup[] {
  const used = rows.filter((row) => row.noteCount > 0);
  const unused = rows.filter((row) => row.noteCount === 0);
  if (used.length === 0 || unused.length === 0) {
    return [{ label: "", rows, offset: 0 }];
  }
  return [
    { label: SORT_GROUP_LABEL[sort], rows: used, offset: 0 },
    { label: "Unused", rows: unused, offset: used.length },
  ];
}

function titleFor(kind: EntityKind): string {
  return kind === "tag" ? "Tags" : "People";
}

function entityGlyph(kind: EntityKind, size: number) {
  return kind === "tag" ? <HashIcon size={size} /> : <UserIcon size={size} />;
}

/**
 * People carry their identity in the avatar, so a person who never had
 * initials typed for them falls back to initials read off the name rather
 * than to an empty circle.
 */
function swatchInitials(
  kind: EntityKind,
  row: Pick<EntityRow, "name" | "initials">,
): string | null {
  if (kind === "tag") {
    return null;
  }
  return row.initials ?? deriveInitials(row.name);
}

export function EntityView({ store, kind }: Props) {
  const selector = useCallback(
    (state: Parameters<typeof projectEntities>[0]) => projectEntities(state, kind),
    [kind],
  );
  const rows = useRendererSelector(store, selector, entityRowsEqual);
  const focusId = useRouteFocus();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("used");

  const viewRows = useMemo(() => sortRows(filterRows(rows, filter), sort), [rows, filter, sort]);
  const groups = useMemo(() => groupRows(viewRows, sort), [viewRows, sort]);
  const orderedRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const summary = useMemo(() => summarizeEntities(rows), [rows]);
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  function commit(operations: readonly ReferenceOperation[]): void {
    commitReferenceOperations(store, operations);
  }

  function mergeInto(source: EntityRow, targetId: string): void {
    const saves = buildMergeSaveDocuments(store.getState(), kind, source.id, targetId);
    function finalizeDelete() {
      commit([buildDelete(kind, source.id)]);
    }
    if (saves.length === 0) {
      finalizeDelete();
      return;
    }
    void commitOperations(store, saves)
      .then(finalizeDelete)
      .catch((error) => console.error("entity merge rejected", error));
  }

  useEffect(() => {
    if (focusId === null || !rows.some((row) => row.id === focusId)) {
      return;
    }
    setSelectedId(focusId);
    setCreating(false);
  }, [focusId, rows]);

  function select(id: string): void {
    setSelectedId(id);
    setRenaming(false);
    setMerging(false);
    setDeleteArmed(false);
    setCreating(false);
  }

  function deleteEntity(row: EntityRow): void {
    commit([buildDelete(kind, row.id)]);
    if (selectedId === row.id) {
      setSelectedId(null);
    }
    setDeleteArmed(false);
  }

  function submitRename(id: string, value: string): void {
    const operation = buildRename(kind, id, value);
    if (operation) {
      commit([operation]);
    }
    setRenaming(false);
  }

  function openNote(noteId: string): void {
    activateNote(store, noteId);
    window.location.hash = appRouteHash("notes");
  }

  function openRelated(entry: RelatedEntity): void {
    if (entry.kind === kind) {
      select(entry.id);
      return;
    }
    window.location.hash = entityFocusHash(entry.kind, entry.id);
  }

  const shortcutOverrides = useRendererSelector(store, selectShortcutOverrides, sameOverrides);
  const createCombo = effectiveShortcutKeys(shortcutDefinition("createNote"), shortcutOverrides);

  /**
   * Opens the create form. When it is already open the name field is refocused,
   * since the form stays mounted and its autofocus never re-runs.
   */
  function openCreateForm(): void {
    setCreating(true);
    setRenaming(false);
    document.querySelector<HTMLInputElement>("[data-entity-create-name]")?.focus();
  }

  useShortcutBinding(
    createCombo,
    openCreateForm,
    { description: `New ${entityNoun(kind)}`, preventDefault: true, scopes: "entity-create" },
    { activeScopes: ["entity-create"] },
  );

  useEffect(() => registerEntityCreate(kind, openCreateForm), [kind]);

  const filterRef = useRef<HTMLInputElement>(null);

  function focusFilter(): void {
    const field = filterRef.current;
    if (!field) {
      return;
    }
    field.focus();
    field.select();
  }

  useShortcutBinding(
    "slash",
    focusFilter,
    {
      description: `Filter ${entityNounPlural(kind)}`,
      preventDefault: true,
      scopes: "entity-filter",
    },
    { activeScopes: ["entity-filter"] },
  );

  /**
   * `mod+f` keeps working from inside the fields too, so it re-selects the
   * filter instead of handing the browser's own find bar the keypress. The
   * plain `/` above stays out of text contexts.
   */
  useShortcutBinding(
    "mod+f",
    focusFilter,
    {
      description: `Filter ${entityNounPlural(kind)}`,
      preventDefault: true,
      scopes: "entity-filter",
    },
    { activeScopes: ["entity-filter"], ignoreInputs: false },
  );

  function submitCreate(fields: FormFields): void {
    const id = crypto.randomUUID();
    const operation =
      kind === "tag"
        ? buildCreateTag(id, fields.name, fields.color)
        : buildCreatePerson(id, fields.name, fields.initials, fields.color, fields.note);
    if (operation) {
      commit([operation]);
      setSelectedId(id);
    }
    setCreating(false);
  }

  const detailOpen = creating || selected !== null;

  if (rows.length === 0 && !creating) {
    return (
      <main
        className="col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
        aria-labelledby="entity-title"
      >
        <EntityTopBar
          kind={kind}
          summary={null}
          createCombo={createCombo}
          creating={creating}
          onCreate={openCreateForm}
          onCancelCreate={() => setCreating(false)}
        />
        <div className="w-[min(380px,calc(100%-40px))] place-self-center text-center text-theme-secondary">
          <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
            {entityGlyph(kind, 22)}
          </span>
          <h2 className="text-[15px] font-[620] text-foreground">
            No {entityNounPlural(kind)} yet
          </h2>
          <p className="mt-1.5 text-xs leading-[1.45]">
            Create {entityNounPlural(kind)} here or by typing {kind === "tag" ? "#" : "$"} while
            writing a note.
          </p>
          <Button variant="primary" className="mt-[18px]" onClick={openCreateForm}>
            New {entityNoun(kind)}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="entity-title"
    >
      <EntityTopBar
        kind={kind}
        summary={summary}
        createCombo={createCombo}
        creating={creating}
        onCreate={openCreateForm}
        onCancelCreate={() => setCreating(false)}
      />

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,288px)_minmax(0,1fr)]">
        <section
          aria-label={titleFor(kind)}
          className={cn(
            "min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]",
            "border-r border-theme-divider md:grid",
            detailOpen ? "hidden" : "grid",
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-theme-divider px-2.5 py-2">
            <div
              className={cn(
                "group flex h-[28px] min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-theme-dim",
                "focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
              )}
            >
              <SearchIcon size={13} aria-hidden="true" />
              <input
                ref={filterRef}
                type="search"
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none [&::-webkit-search-cancel-button]:hidden"
                placeholder="Filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label={`Filter ${entityNounPlural(kind)}`}
              />
              {filter.length === 0 && (
                <kbd
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-md border border-border bg-muted/45 px-[5px] py-0.5",
                    "font-mono text-[10px] leading-none text-theme-dim group-focus-within:hidden",
                  )}
                  aria-hidden="true"
                >
                  /
                </kbd>
              )}
            </div>
            <Select
              label={`Sort ${entityNounPlural(kind)}`}
              value={sort}
              options={SORT_OPTIONS}
              onChange={setSort}
            />
          </div>

          {viewRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] leading-[1.5] text-theme-dim">
              {filter.trim().length > 0
                ? `No ${entityNounPlural(kind)} match “${filter}”.`
                : `No ${entityNounPlural(kind)} yet.`}
            </p>
          ) : (
            <EntityList
              groups={groups}
              rows={orderedRows}
              kind={kind}
              busiest={summary.busiest}
              canMerge={rows.length > 1}
              selectedId={selectedId}
              onSelect={select}
              onRename={(row) => {
                select(row.id);
                setRenaming(true);
              }}
              onDelete={(row) => {
                select(row.id);
                setDeleteArmed(true);
              }}
              onMerge={(row) => {
                select(row.id);
                setMerging(true);
              }}
            />
          )}
        </section>

        <section
          className={cn(
            "min-h-0 min-w-0 overflow-y-auto md:block",
            detailOpen ? "block" : "hidden",
          )}
          aria-label={creating ? `New ${entityNoun(kind)}` : `${entityNoun(kind)} detail`}
        >
          {creating ? (
            <div className={cn(detailColumnClass, "py-6")}>
              <BackToList
                label={`Back to ${entityNounPlural(kind)}`}
                onClick={() => setCreating(false)}
              />
              <h2 className="mb-3.5 mt-3 text-[15px] font-[620] tracking-[-0.01em] text-foreground">
                New {entityNoun(kind)}
              </h2>
              <EntityForm
                kind={kind}
                submitLabel={`Create ${entityNoun(kind)}`}
                onCancel={() => setCreating(false)}
                onSubmit={submitCreate}
              />
            </div>
          ) : selected ? (
            <EntityDetailPane
              key={selected.id}
              store={store}
              kind={kind}
              row={selected}
              renaming={renaming}
              merging={merging && rows.length > 1}
              mergeTargets={rows}
              onBack={() => setSelectedId(null)}
              onStartRename={() => setRenaming(true)}
              onSubmitRename={(value) => submitRename(selected.id, value)}
              onCancelRename={() => setRenaming(false)}
              onRecolor={(color) => commit([buildRecolor(kind, selected.id, color)])}
              deleteArmed={deleteArmed}
              onDeleteArmedChange={setDeleteArmed}
              onDelete={() => deleteEntity(selected)}
              onToggleMerge={() => setMerging((open) => !open)}
              onCancelMerge={() => setMerging(false)}
              onMerge={(targetId) => {
                mergeInto(selected, targetId);
                setSelectedId(targetId);
                setMerging(false);
              }}
              onOpenNote={openNote}
              onOpenRelated={openRelated}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div className="max-w-[34ch] text-theme-secondary">
                <span
                  className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-theme-hover text-theme-dim"
                  aria-hidden="true"
                >
                  {entityGlyph(kind, 17)}
                </span>
                <p className="text-[13px] font-[600] text-foreground">
                  Select {kind === "tag" ? "a tag" : "someone"}
                </p>
                <p className="mt-1 text-xs leading-[1.5]">
                  {kind === "tag"
                    ? "Every note carrying the tag, the tags it travels with, and where it came from."
                    : "Every note mentioning them, who else shows up, and what you wrote about them."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

type EntityTopBarProps = {
  kind: EntityKind;
  summary: ReturnType<typeof summarizeEntities> | null;
  createCombo: string;
  creating: boolean;
  onCreate: () => void;
  onCancelCreate: () => void;
};

function EntityTopBar({
  kind,
  summary,
  createCombo,
  creating,
  onCreate,
  onCancelCreate,
}: EntityTopBarProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-2.5 border-b border-theme-divider pl-4"
    >
      <span className="shrink-0 text-theme-secondary" aria-hidden="true">
        {entityGlyph(kind, 14)}
      </span>
      <h1
        id="entity-title"
        className="shrink-0 text-[13px] font-[650] tracking-[-0.01em] text-foreground"
      >
        {titleFor(kind)}
      </h1>
      {summary !== null && summary.total > 0 && (
        <p className="hidden min-w-0 truncate text-[11px] text-theme-secondary sm:block">
          <span className="tabular-nums text-foreground/70">{summary.total}</span>{" "}
          {summary.total === 1 ? entityNoun(kind) : entityNounPlural(kind)}
          <Dot />
          <span className="tabular-nums text-foreground/70">{summary.references}</span> reference
          {summary.references === 1 ? "" : "s"}
          {summary.unused > 0 && (
            <>
              <Dot />
              <span className="tabular-nums text-foreground/70">{summary.unused}</span> unused
            </>
          )}
        </p>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
        <Button
          className={cn(inlinePressClass, "h-[26px] min-h-0 pr-1.5")}
          aria-expanded={creating}
          onClick={() => (creating ? onCancelCreate() : onCreate())}
        >
          New {entityNoun(kind)}
          <kbd
            className="inline-flex items-center gap-px rounded-md border border-border bg-background/60 px-[5px] py-0.5 font-mono text-[10px] leading-none tracking-[0.02em] text-foreground/70"
            aria-hidden="true"
          >
            {formatShortcut(createCombo)}
          </kbd>
        </Button>
        <WindowControls className="-mr-1" />
      </div>
    </header>
  );
}

function Dot() {
  return <span className="px-1.5 text-theme-dim">·</span>;
}

type BackToListProps = {
  label: string;
  onClick: () => void;
};

/**
 * Only reachable below the two-pane breakpoint, where the detail replaces the
 * list instead of sitting beside it.
 */
function BackToList({ label, onClick }: BackToListProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 flex h-7 cursor-pointer items-center gap-1 rounded-[var(--radius)] px-1 pr-2 text-[12px] font-[560] text-theme-secondary transition-colors hover:bg-theme-hover hover:text-foreground md:hidden"
    >
      <ChevronLeftIcon size={15} />
      {label}
    </button>
  );
}

type EntityListProps = {
  groups: readonly RowGroup[];
  rows: readonly EntityRow[];
  kind: EntityKind;
  busiest: number;
  canMerge: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (row: EntityRow) => void;
  onDelete: (row: EntityRow) => void;
  onMerge: (row: EntityRow) => void;
};

function EntityList({
  groups,
  rows,
  kind,
  busiest,
  canMerge,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onMerge,
}: EntityListProps) {
  const ref = useRef<HTMLDivElement>(null);

  function focusRow(index: number): void {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    const target = rows[clamped];
    if (!target) {
      return;
    }
    ref.current
      ?.querySelector<HTMLButtonElement>(`[data-entity-id="${CSS.escape(target.id)}"]`)
      ?.focus();
  }

  return (
    <div ref={ref} className="min-h-0 overflow-y-auto pb-3">
      {groups.map((group) => (
        <div key={group.label} className="pt-1">
          {group.label.length > 0 && (
            <h2 className={cn(sectionLabelClass, "px-3.5 pb-1 pt-2.5")}>{group.label}</h2>
          )}
          <ul aria-label={group.label.length > 0 ? group.label : titleFor(kind)}>
            {group.rows.map((row, rowIndex) => (
              <EntityListRow
                key={row.id}
                row={row}
                kind={kind}
                busiest={busiest}
                canMerge={canMerge}
                selected={selectedId === row.id}
                index={group.offset + rowIndex}
                lastIndex={rows.length - 1}
                onSelect={onSelect}
                onFocusRow={focusRow}
                onRename={onRename}
                onDelete={onDelete}
                onMerge={onMerge}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type EntityListRowProps = {
  row: EntityRow;
  kind: EntityKind;
  busiest: number;
  canMerge: boolean;
  selected: boolean;
  index: number;
  lastIndex: number;
  onSelect: (id: string) => void;
  onFocusRow: (index: number) => void;
  onRename: (row: EntityRow) => void;
  onDelete: (row: EntityRow) => void;
  onMerge: (row: EntityRow) => void;
};

function EntityListRow({
  row,
  kind,
  busiest,
  canMerge,
  selected,
  index,
  lastIndex,
  onSelect,
  onFocusRow,
  onRename,
  onDelete,
  onMerge,
}: EntityListRowProps) {
  const share = busiest > 0 ? row.noteCount / busiest : 0;

  const actedRef = useRef(false);

  function act(handler: (target: EntityRow) => void): (target: EntityRow) => void {
    return (target) => {
      actedRef.current = true;
      handler(target);
    };
  }

  /**
   * Every row action moves focus somewhere on purpose (rename field, merge
   * search, delete confirm); Radix returning it to the trigger would undo that.
   * The rename field mounts while the menu's focus trap is still active, so its
   * autoFocus is swallowed and has to be re-applied once the menu has closed.
   */
  function keepActionFocus(event: Event): void {
    if (actedRef.current) {
      actedRef.current = false;
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-entity-rename-field] input")?.focus();
    }
  }

  return (
    <li className="px-1.5">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
              selected ? "bg-theme-active" : "hover:bg-foreground/[0.035]",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-[7px] text-left text-foreground"
              data-entity-id={row.id}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Home" || (event.key === "ArrowUp" && event.shiftKey)) {
                  onFocusRow(0);
                  event.preventDefault();
                } else if (event.key === "End" || (event.key === "ArrowDown" && event.shiftKey)) {
                  onFocusRow(lastIndex);
                  event.preventDefault();
                } else if (event.key === "ArrowDown") {
                  onFocusRow(index + 1);
                  event.preventDefault();
                } else if (event.key === "ArrowUp") {
                  onFocusRow(index - 1);
                  event.preventDefault();
                }
              }}
            >
              <span
                className={cn(rowSwatchClass, "mt-px")}
                style={{ background: row.color ?? "transparent" }}
                data-empty={row.color === null ? "" : undefined}
                aria-hidden="true"
              >
                {swatchInitials(kind, row)}
              </span>
              <span className="grid min-w-0 flex-1 gap-[2px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-[560] leading-[1.35]">
                    {kind === "tag" && (
                      <span className="text-theme-dim" aria-hidden="true">
                        #
                      </span>
                    )}
                    {row.name}
                  </span>
                  <UsageBar share={share} color={row.color} />
                  <span
                    className={cn(
                      "w-[14px] shrink-0 text-right font-mono text-[10px] tabular-nums",
                      row.noteCount === 0 ? "text-theme-dim/60" : "text-theme-dim",
                    )}
                  >
                    {row.noteCount}
                  </span>
                </span>
                {kind === "person" && row.note !== null && (
                  <span className="truncate text-[11px] leading-[1.35] text-theme-dim">
                    {row.note}
                  </span>
                )}
              </span>
            </button>
            <DropdownMenu>
              <Tooltip label="Actions" side="top">
                <DropdownMenuTrigger
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground opacity-0 transition-opacity hover:border-border hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:border-border data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100",
                    focusRingClass,
                  )}
                  aria-label={`Actions for ${row.name}`}
                >
                  <MoreHorizontalIcon size={15} />
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={keepActionFocus}>
                <EntityMenuItems
                  surface={dropdownMenuSurface}
                  row={row}
                  canMerge={canMerge}
                  onRename={act(onRename)}
                  onMerge={act(onMerge)}
                  onDelete={act(onDelete)}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44" onCloseAutoFocus={keepActionFocus}>
          <EntityMenuItems
            surface={contextMenuSurface}
            row={row}
            canMerge={canMerge}
            onRename={act(onRename)}
            onMerge={act(onMerge)}
            onDelete={act(onDelete)}
          />
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

type UsageBarProps = {
  share: number;
  color: string | null;
};

/**
 * A row's note count read as length rather than as a number, so the busiest
 * entities stand out without reading every figure. It sits beside the count
 * rather than under the name, where a full-width track reads as a rule.
 */
function UsageBar({ share, color }: UsageBarProps) {
  return (
    <span
      className="block h-[3px] w-[32px] shrink-0 overflow-hidden rounded-full bg-foreground/[0.08]"
      aria-hidden="true"
    >
      <span
        className="block h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          width: `${Math.round(Math.max(share, share > 0 ? 0.12 : 0) * 100)}%`,
          background: color ?? "hsl(var(--foreground) / 0.3)",
        }}
      />
    </span>
  );
}

type MenuSurface = {
  Item: ComponentType<{
    className?: string;
    onSelect: (event: Event) => void;
    children: ReactNode;
  }>;
  Separator: ComponentType<Record<string, never>>;
};

const contextMenuSurface: MenuSurface = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
};

const dropdownMenuSurface: MenuSurface = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
};

type EntityMenuItemsProps = {
  surface: MenuSurface;
  row: EntityRow;
  canMerge: boolean;
  onRename: (row: EntityRow) => void;
  onMerge: (row: EntityRow) => void;
  onDelete: (row: EntityRow) => void;
};

/**
 * Row actions rendered into either menu surface, so the right-click menu and
 * the keyboard-reachable kebab menu stay a single definition. Recolouring is
 * absent on purpose: the detail pane exposes the swatches directly.
 */
function EntityMenuItems({
  surface: { Item, Separator },
  row,
  canMerge,
  onRename,
  onMerge,
  onDelete,
}: EntityMenuItemsProps) {
  return (
    <>
      <Item className="gap-2" onSelect={() => onRename(row)}>
        <PencilIcon size={14} />
        Rename
      </Item>
      {canMerge && (
        <Item className="gap-2" onSelect={() => onMerge(row)}>
          <WaypointsIcon size={14} />
          Merge into…
        </Item>
      )}
      <Separator />
      <Item
        className="gap-2 text-destructive focus:text-destructive"
        onSelect={() => onDelete(row)}
      >
        <Trash2Icon size={14} />
        Delete
      </Item>
    </>
  );
}

const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

type EntityDetailPaneProps = {
  store: RendererStore;
  kind: EntityKind;
  row: EntityRow;
  renaming: boolean;
  merging: boolean;
  mergeTargets: readonly EntityRow[];
  deleteArmed: boolean;
  onDeleteArmedChange: (armed: boolean) => void;
  onBack: () => void;
  onStartRename: () => void;
  onSubmitRename: (value: string) => void;
  onCancelRename: () => void;
  onRecolor: (color: string | null) => void;
  onDelete: () => void;
  onToggleMerge: () => void;
  onCancelMerge: () => void;
  onMerge: (targetId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenRelated: (entry: RelatedEntity) => void;
};

function EntityDetailPane({
  store,
  kind,
  row,
  renaming,
  merging,
  mergeTargets,
  deleteArmed,
  onDeleteArmedChange,
  onBack,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onRecolor,
  onDelete,
  onToggleMerge,
  onCancelMerge,
  onMerge,
  onOpenNote,
  onOpenRelated,
}: EntityDetailPaneProps) {
  const mergeButtonRef = useRef<HTMLButtonElement>(null);
  const canMerge = mergeTargets.length > 1;
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const deleteLabel = `Delete ${entityNoun(kind)} ${row.name}`;
  const selector = useCallback(
    (state: Parameters<typeof projectEntityDetail>[0]) => projectEntityDetail(state, kind, row.id),
    [kind, row.id],
  );
  const detail: EntityDetail = useRendererSelector(store, selector, entityDetailEqual);

  return (
    <div className={cn(detailColumnClass, "py-6")}>
      <BackToList label={titleFor(kind)} onClick={onBack} />

      <div className="mt-3 flex items-start gap-3.5">
        <span
          className={heroSwatchClass}
          style={{ background: row.color ?? "transparent" }}
          data-empty={row.color === null ? "" : undefined}
          aria-hidden="true"
        >
          {swatchInitials(kind, row)}
        </span>
        <div className="min-w-0 flex-1" data-entity-rename-field={renaming ? "" : undefined}>
          {renaming ? (
            <InlineEdit
              className="-ml-1.5 px-0"
              inputClassName="text-[19px] font-[650] tracking-[-0.02em]"
              defaultValue={row.name}
              ariaLabel={`Rename ${entityNoun(kind)} ${row.name}`}
              onSubmit={onSubmitRename}
              onCancel={onCancelRename}
            />
          ) : (
            <button
              type="button"
              className="group -ml-1 flex min-w-0 max-w-full cursor-text items-center gap-1.5 rounded-md px-1 text-left"
              onClick={onStartRename}
              aria-label={`Rename ${entityNoun(kind)} ${row.name}`}
            >
              <span className="min-w-0 truncate text-[19px] font-[650] leading-[1.25] tracking-[-0.02em] text-foreground">
                {kind === "tag" && (
                  <span className="text-theme-dim" aria-hidden="true">
                    #
                  </span>
                )}
                {row.name}
              </span>
              <PencilIcon
                size={13}
                className="shrink-0 text-theme-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden="true"
              />
            </button>
          )}
          <p className="mt-1 flex flex-wrap items-center text-[11px] leading-[1.5] text-theme-secondary">
            <span className="tabular-nums text-foreground/70">{row.noteCount}</span>
            <span className="pl-1">{row.noteCount === 1 ? "note" : "notes"}</span>
            {row.createdAt > 0 && (
              <>
                <Dot />
                <span title={absoluteFormatter.format(new Date(row.createdAt))}>
                  created {formatRelativeTime(row.createdAt)}
                  {row.createdInTitle ? ` in ${row.createdInTitle}` : null}
                </span>
              </>
            )}
            {row.updatedAt > row.createdAt && (
              <>
                <Dot />
                <span title={absoluteFormatter.format(new Date(row.updatedAt))}>
                  edited {formatRelativeTime(row.updatedAt)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canMerge && !deleteArmed && (
            <Button
              ref={mergeButtonRef}
              className={cn(
                inlinePressClass,
                "h-[26px] min-h-0",
                merging && "border-foreground/20 bg-theme-active text-foreground",
              )}
              onClick={onToggleMerge}
              aria-expanded={merging}
            >
              <WaypointsIcon size={13} />
              Merge
            </Button>
          )}
          <InlineConfirm
            armed={deleteArmed}
            onArmedChange={onDeleteArmedChange}
            confirmLabel={`Delete ${entityNoun(kind)}`}
            message={
              row.noteCount === 0
                ? undefined
                : `Used in ${row.noteCount === 1 ? "1 note" : `${row.noteCount} notes`}`
            }
            onConfirm={onDelete}
            renderIdle={(arm) =>
              coarsePointer ? (
                <HoldToConfirm
                  ariaLabel={deleteLabel}
                  className={cn(buttonVariants({ variant: "danger" }), "h-9 min-h-0 px-3")}
                  onConfirm={onDelete}
                  onKeyboardActivate={arm}
                >
                  <Trash2Icon size={15} />
                </HoldToConfirm>
              ) : (
                <Button
                  variant="danger"
                  className={cn(inlinePressClass, "h-[26px] min-h-0 px-2")}
                  onClick={arm}
                  aria-label={deleteLabel}
                >
                  <Trash2Icon size={14} />
                </Button>
              )
            }
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {merging && (
          <MergePanel
            kind={kind}
            source={row}
            targets={mergeTargets}
            onMerge={onMerge}
            onCancel={() => {
              onCancelMerge();
              mergeButtonRef.current?.focus();
            }}
          />
        )}
      </AnimatePresence>

      {kind === "person" && row.note !== null && (
        <p className="mt-4 border-l-2 border-theme-divider pl-3 text-[13px] leading-[1.6] text-foreground/80">
          {row.note}
        </p>
      )}

      <DetailSection title="Color">
        <ColorSwatchRow
          label={`Recolor ${entityNoun(kind)} ${row.name}`}
          value={row.color}
          onChange={onRecolor}
        />
      </DetailSection>

      {detail.related.length > 0 && (
        <DetailSection title={kind === "tag" ? "Appears with" : "Shows up alongside"}>
          <ul className="flex flex-wrap gap-1.5">
            {detail.related.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`}>
                <button
                  type="button"
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-1.5 pr-2.5 text-[11px] font-[560] text-foreground/85 transition-colors hover:border-foreground/25 hover:bg-theme-hover",
                    focusRingClass,
                  )}
                  onClick={() => onOpenRelated(entry)}
                >
                  <span
                    className={chipSwatchClass}
                    style={{ background: entry.color ?? "transparent" }}
                    data-empty={entry.color === null ? "" : undefined}
                    aria-hidden="true"
                  >
                    {swatchInitials(entry.kind, entry)}
                  </span>
                  <span className="max-w-[18ch] truncate">
                    {entry.kind === "tag" ? "#" : ""}
                    {entry.name}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-theme-dim">
                    {entry.sharedNotes}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      <DetailSection title="Notes" count={detail.notes.length}>
        {detail.notes.length === 0 ? (
          <p className="text-[12px] leading-[1.5] text-theme-dim">
            No notes reference this {entityNoun(kind)} yet. Type {kind === "tag" ? "#" : "$"}
            {row.name} while writing to link one.
          </p>
        ) : (
          <ul className="grid gap-px">
            {detail.notes.map((entry) => (
              <li key={entry.noteId}>
                <button
                  type="button"
                  className={cn(
                    "group grid w-full cursor-pointer gap-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.04]",
                    focusRingClass,
                  )}
                  onClick={() => onOpenNote(entry.noteId)}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <FileTextIcon
                      size={13}
                      className="shrink-0 translate-y-0.5 text-theme-dim"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-[560] text-foreground">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-theme-dim">
                      {formatRelativeTime(entry.updatedAt)}
                    </span>
                  </span>
                  {entry.snippet !== null && (
                    <span className="line-clamp-2 pl-[21px] text-[11.5px] leading-[1.5] text-theme-secondary">
                      {entry.snippet}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </div>
  );
}

type MergePanelProps = {
  kind: EntityKind;
  source: EntityRow;
  targets: readonly EntityRow[];
  onMerge: (targetId: string) => void;
  onCancel: () => void;
};

/**
 * Picks the entity that absorbs `source`, in the page flow rather than a modal.
 * Choosing a row only stages it; the explicit Merge button commits, because
 * the source is deleted afterwards.
 */
function MergePanel({ kind, source, targets, onMerge, onCancel }: MergePanelProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const candidates = useMemo(
    () =>
      sortRows(
        filterRows(
          targets.filter((row) => row.id !== source.id),
          query,
        ),
        "used",
      ),
    [targets, source.id, query],
  );
  const chosen = targets.find((row) => row.id === chosenId) ?? null;
  const navigation = useListboxNavigation({
    count: candidates.length,
    onSelect: (index) => setChosenId(candidates[index]?.id ?? null),
  });
  const noun = entityNoun(kind);

  function label(row: EntityRow): string {
    return kind === "tag" ? `#${row.name}` : row.name;
  }

  return (
    <motion.section
      aria-label={`Merge ${label(source)} into another ${noun}`}
      className="overflow-hidden"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="mt-4 rounded-xl border border-border bg-foreground/[0.02] p-2">
        <div className="flex items-baseline justify-between gap-3 px-1.5 pb-2 pt-1">
          <h3 className={sectionLabelClass}>Merge into</h3>
          <span className="truncate text-[11px] text-theme-dim">
            {label(source)} is removed afterwards
          </span>
        </div>

        <div
          className={cn(
            "flex h-[28px] items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-theme-dim",
            "focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
          )}
        >
          <SearchIcon size={13} aria-hidden="true" />
          <input
            type="search"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              candidates.length > 0 ? `${listId}-${navigation.activeIndex}` : undefined
            }
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none [&::-webkit-search-cancel-button]:hidden"
            placeholder={`Find a ${noun}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Tab") {
                navigation.onKeyDown(event);
              }
            }}
            aria-label={`Find a ${noun} to merge into`}
          />
        </div>

        <div
          ref={navigation.listRef}
          id={listId}
          role="listbox"
          aria-label={`${entityNounPlural(kind)} to merge into`}
          className="mt-1.5 flex max-h-[216px] flex-col gap-px overflow-y-auto"
        >
          {candidates.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-theme-dim">
              No {entityNounPlural(kind)} match “{query}”.
            </p>
          ) : (
            candidates.map((target, index) => {
              const isChosen = target.id === chosenId;
              return (
                <div
                  key={target.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isChosen}
                  data-index={index}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-[6px] text-foreground transition-colors",
                    isChosen
                      ? "bg-theme-active"
                      : index === navigation.activeIndex && "bg-foreground/[0.035]",
                  )}
                  onMouseMove={() => navigation.setActiveIndex(index)}
                  onClick={() => setChosenId(target.id)}
                >
                  <span
                    className={rowSwatchClass}
                    style={{ background: target.color ?? "transparent" }}
                    data-empty={target.color === null ? "" : undefined}
                    aria-hidden="true"
                  >
                    {swatchInitials(kind, target)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-[560] leading-[1.35]">
                    {kind === "tag" && (
                      <span className="text-theme-dim" aria-hidden="true">
                        #
                      </span>
                    )}
                    {target.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-theme-dim">
                    {target.noteCount}
                  </span>
                  <CheckIcon
                    size={13}
                    className={cn("shrink-0 text-foreground", !isChosen && "invisible")}
                    aria-hidden="true"
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-theme-divider px-1.5 pt-2">
          <p className="min-w-0 text-[12px] leading-[1.4] text-theme-secondary" aria-live="polite">
            {chosen === null
              ? `Pick where references to ${label(source)} should go.`
              : `${source.noteCount === 1 ? "1 note" : `${source.noteCount} notes`} will reference ${label(chosen)}.`}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Button className={cn(inlinePressClass, "h-[26px] min-h-0")} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className={cn(inlinePressClass, "h-[26px] min-h-0")}
              disabled={chosen === null}
              onClick={() => chosen && onMerge(chosen.id)}
            >
              Merge
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

type DetailSectionProps = {
  title: string;
  count?: number;
  children: ReactNode;
};

function DetailSection({ title, count, children }: DetailSectionProps) {
  return (
    <section className="mt-6 border-t border-theme-divider pt-4">
      <h3 className={cn(sectionLabelClass, "mb-2.5 flex items-center gap-1.5")}>
        {title}
        {count !== undefined && (
          <span className="font-normal tabular-nums text-muted-foreground/45">{count}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

type FormFields = {
  name: string;
  color: string | null;
  initials: string;
  note: string;
};

type EntityFormProps = {
  kind: EntityKind;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fields: FormFields) => void;
};

const fieldInputClass =
  "min-w-0 rounded-lg border border-border bg-background px-[9px] py-[6px] text-[13px] text-foreground outline-none transition-colors duration-[130ms] ease-out placeholder:text-theme-dim focus:border-ring focus:bg-theme-hover";

const fieldLabelClass = "shrink-0 text-[11px] font-[560] tracking-[0.01em] text-theme-secondary";

const formShell: Variants = {
  hidden: { opacity: 0, transform: "translateY(6px)" },
  shown: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: {
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.03,
      delayChildren: 0.04,
    },
  },
};

const formRow: Variants = {
  hidden: { opacity: 0, transform: "translateY(-4px)" },
  shown: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
};

function EntityForm({ kind, submitLabel, onCancel, onSubmit }: EntityFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [initials, setInitials] = useState("");
  const [note, setNote] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const derived = useMemo(() => deriveInitials(name), [name]);
  const canSubmit = name.trim().length > 0;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <motion.form
      className="grid gap-3 rounded-lg border border-border bg-theme-hover p-3"
      aria-label={`New ${entityNoun(kind)}`}
      variants={formShell}
      initial="hidden"
      animate="shown"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit({ name, color, initials, note });
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {kind === "person" ? (
        <PersonFormFields
          nameRef={nameRef}
          name={name}
          initials={initials}
          derived={derived}
          color={color}
          note={note}
          rowVariants={formRow}
          onNameChange={setName}
          onInitialsChange={setInitials}
          onColorChange={setColor}
          onNoteChange={setNote}
        />
      ) : (
        <TagFormFields
          nameRef={nameRef}
          name={name}
          color={color}
          rowVariants={formRow}
          onNameChange={setName}
          onColorChange={setColor}
        />
      )}
      <motion.div
        className="flex justify-end gap-2 border-t border-theme-divider pt-2.5"
        variants={formRow}
      >
        <Button className={inlinePressClass} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" className={inlinePressClass} disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </motion.div>
    </motion.form>
  );
}

type TagFormFieldsProps = {
  nameRef: React.Ref<HTMLInputElement>;
  name: string;
  color: string | null;
  rowVariants: Variants | undefined;
  onNameChange: (value: string) => void;
  onColorChange: (color: string | null) => void;
};

function TagFormFields({
  nameRef,
  name,
  color,
  rowVariants,
  onNameChange,
  onColorChange,
}: TagFormFieldsProps) {
  return (
    <>
      <motion.div className="flex items-center gap-2.5" variants={rowVariants}>
        <span
          className={rowSwatchClass}
          style={{ background: color ?? "transparent" }}
          data-empty={color === null ? "" : undefined}
          aria-hidden="true"
        />
        <input
          ref={nameRef}
          type="text"
          data-entity-create-name=""
          className={cn(fieldInputClass, "flex-1")}
          placeholder="Tag name"
          aria-label="Name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </motion.div>
      <motion.div className="flex items-center gap-2 pl-[32px]" variants={rowVariants}>
        <span className={fieldLabelClass}>Color</span>
        <ColorSwatchRow label="Color" value={color} onChange={onColorChange} />
      </motion.div>
    </>
  );
}

type PersonFormFieldsProps = {
  nameRef: React.Ref<HTMLInputElement>;
  name: string;
  initials: string;
  derived: string;
  color: string | null;
  note: string;
  rowVariants: Variants | undefined;
  onNameChange: (value: string) => void;
  onInitialsChange: (value: string) => void;
  onColorChange: (color: string | null) => void;
  onNoteChange: (value: string) => void;
};

/**
 * The person form carries more than a tag does — an avatar, initials, and a
 * note — so it lays out as an avatar preview beside a stacked name/note column,
 * with the two secondary controls on their own labelled row underneath.
 */
function PersonFormFields({
  nameRef,
  name,
  initials,
  derived,
  color,
  note,
  rowVariants,
  onNameChange,
  onInitialsChange,
  onColorChange,
  onNoteChange,
}: PersonFormFieldsProps) {
  return (
    <>
      <motion.div className="flex items-start gap-3" variants={rowVariants}>
        <span
          className={cn(swatchBaseClass, "h-9 w-9 text-[12px]")}
          style={{ background: color ?? "transparent" }}
          data-empty={color === null ? "" : undefined}
          aria-hidden="true"
        >
          {initials || derived}
        </span>
        <div className="grid min-w-0 flex-1 gap-2">
          <input
            ref={nameRef}
            type="text"
            data-entity-create-name=""
            className={fieldInputClass}
            placeholder="Person name"
            aria-label="Name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
          <textarea
            className={cn(fieldInputClass, "resize-y leading-[1.45]")}
            placeholder="Note (optional)"
            aria-label="Note"
            rows={2}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>
      </motion.div>
      <motion.div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[48px]"
        variants={rowVariants}
      >
        <label className="flex items-center gap-2">
          <span className={fieldLabelClass}>Initials</span>
          <input
            type="text"
            className={cn(fieldInputClass, "w-[58px] text-center uppercase")}
            placeholder={derived || "AB"}
            maxLength={4}
            value={initials}
            onChange={(event) => onInitialsChange(event.target.value)}
          />
        </label>
        <div className="flex items-center gap-2">
          <span className={fieldLabelClass}>Color</span>
          <ColorSwatchRow label="Color" value={color} onChange={onColorChange} />
        </div>
      </motion.div>
    </>
  );
}
