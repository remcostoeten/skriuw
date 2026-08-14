import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useShortcutBinding } from "@remcostoeten/use-shortcut/react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { activateNote, commitOperations, commitReferenceOperations } from "@/store/actions/workspace";
import { appRouteHash, useRouteFocus } from "@/app-route";
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
  type EntityKind,
  type EntityRow,
} from "./entity-manager-model";
import { backlinksEqual, projectReferencingNotes } from "./reference-panel-model";
import { buildMergeSaveDocuments } from "./entity-merge";
import { registerEntityCreate } from "./entity-create-controller";
import { ColorSwatchRow } from "./color-swatch-row";
import {
  CircleIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  WaypointsIcon,
} from "@/shared/icons/static";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { effectiveShortcutKeys, shortcutDefinition } from "@/commands/bindings";
import { sameOverrides, selectShortcutOverrides } from "@/features/settings/sections/selectors";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineEdit } from "@/shared/ui/inline-edit";
import { Select, type SelectOption } from "@/shared/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { Tooltip } from "@/shared/ui/tooltip";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { cn } from "@/shared/lib/utils";
import type { RendererStore } from "@/store/types";
import type { ReferenceOperation } from "./types";

const entitySwatchClass =
  "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold tracking-[0.02em] text-background transition-[background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-empty:border data-empty:border-dashed data-empty:border-border data-empty:bg-transparent";
const entityNoteCountClass = "shrink-0 font-mono text-[10px] text-theme-dim";
const entityFocusRingClass = "focus-visible:bg-muted focus-visible:text-foreground";
const entityRowClass = cn(
  "border-b border-theme-divider transition-colors hover:bg-foreground/[0.035]",
  "focus-within:bg-foreground/[0.05]",
);
const inlinePressClass =
  "transition-transform duration-[140ms] ease-out enabled:active:scale-[0.97]";
const columnClass = "mx-auto w-[min(100%,720px)] px-[clamp(20px,4vw,40px)]";

type Props = {
  store: RendererStore;
  kind: EntityKind;
};

type Pending =
  | { mode: "delete"; row: EntityRow }
  | { mode: "merge"; row: EntityRow };

type SortMode = "name" | "recent" | "used";

const SORT_OPTIONS: readonly SelectOption<SortMode>[] = [
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently created" },
  { value: "used", label: "Most used" },
];

function sortRows(rows: readonly EntityRow[], sort: SortMode): EntityRow[] {
  const sorted = [...rows];
  if (sort === "recent") {
    sorted.sort((left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name));
  } else if (sort === "used") {
    sorted.sort((left, right) => right.noteCount - left.noteCount || left.name.localeCompare(right.name));
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
  return rows.filter((row) => row.name.toLowerCase().includes(trimmed));
}

function titleFor(kind: EntityKind): string {
  return kind === "tag" ? "Tags" : "People";
}

function descriptionFor(kind: EntityKind): string {
  return kind === "tag"
    ? "Create, rename, recolor, or delete tags used across your notes."
    : "Create, rename, recolor, or delete people mentioned across your notes.";
}

export function EntityView({ store, kind }: Props) {
  const selector = useCallback(
    (state: Parameters<typeof projectEntities>[0]) => projectEntities(state, kind),
    [kind],
  );
  const rows = useRendererSelector(store, selector, entityRowsEqual);
  const focusId = useRouteFocus();
  const [pending, setPending] = useState<Pending | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recoloringId, setRecoloringId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const viewRows = useMemo(() => sortRows(filterRows(rows, filter), sort), [rows, filter, sort]);

  function mergeInto(source: EntityRow, targetId: string): void {
    const saves = buildMergeSaveDocuments(store.getState(), kind, source.id, targetId);
    const finalizeDelete = () => commit([buildDelete(kind, source.id)]);
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
    setExpandedId(focusId);
    const target = document.querySelector<HTMLElement>(`[data-entity-id="${CSS.escape(focusId)}"]`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.focus();
    }
  }, [focusId, rows]);

  function submitRename(id: string, value: string): void {
    const operation = buildRename(kind, id, value);
    if (operation) {
      commit([operation]);
    }
    setEditingId(null);
  }

  function commit(operations: readonly ReferenceOperation[]): void {
    commitReferenceOperations(store, operations);
  }

  function openNote(noteId: string): void {
    activateNote(store, noteId);
    window.location.hash = appRouteHash("notes");
  }

  const shortcutOverrides = useRendererSelector(store, selectShortcutOverrides, sameOverrides);
  const createCombo = effectiveShortcutKeys(shortcutDefinition("createNote"), shortcutOverrides);

  /**
   * Opens the inline create form. When it is already open the name field is
   * refocused, since the form stays mounted and its autofocus never re-runs.
   */
  function openCreateForm(): void {
    setCreating(true);
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
    }
    setCreating(false);
  }

  return (
    <main
      className="relative col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="entity-title"
    >
      <WindowControls className="absolute right-0 top-0" />
      <header className={cn(columnClass, "border-b border-theme-divider pb-4 pt-[26px]")}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <h1
              id="entity-title"
              className="text-base font-[650] tracking-[-0.015em] text-foreground"
            >
              {titleFor(kind)}
            </h1>
            {rows.length > 0 && (
              <span className="min-w-[19px] rounded-lg border border-border px-1.5 py-0.5 text-center font-mono text-[10px] leading-[1.3] text-theme-secondary">
                {rows.length}
              </span>
            )}
          </div>
          <Button
            className={cn(inlinePressClass, "shrink-0 pr-1.5")}
            aria-expanded={creating}
            onClick={() => (creating ? setCreating(false) : openCreateForm())}
          >
            New {entityNoun(kind)}
            <kbd
              className="inline-flex items-center gap-px rounded-md border border-border bg-background/60 px-[5px] py-0.5 font-mono text-[10px] leading-none tracking-[0.02em] text-foreground/70"
              aria-hidden="true"
            >
              {formatShortcut(createCombo)}
            </kbd>
          </Button>
        </div>
        <p className="mt-1 max-w-xl text-xs leading-[1.45] text-theme-secondary">
          {descriptionFor(kind)}
        </p>
        {rows.length > 0 && (
          <div className="mt-3.5 flex items-center gap-2">
            <div
              className={cn(
                "group flex h-[30px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-theme-dim",
                "focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
              )}
            >
              <SearchIcon size={14} aria-hidden="true" />
              <input
                ref={filterRef}
                type="search"
                className="flex-1 bg-transparent text-xs text-foreground outline-none"
                placeholder={`Filter ${entityNounPlural(kind)}`}
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
              prefix="Sort"
              value={sort}
              options={SORT_OPTIONS}
              onChange={setSort}
            />
          </div>
        )}
      </header>

      {rows.length === 0 && !creating ? (
        <div className="w-[min(380px,calc(100%-40px))] place-self-center text-center text-theme-secondary">
          <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
            {kind === "tag" ? <WaypointsIcon size={22} /> : <CircleIcon size={22} />}
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
      ) : (
        <div className="min-h-0 overflow-y-auto">
          <div className={columnClass}>
            <AnimatePresence initial={false}>
              {creating && (
                <InlineEntityForm
                  key="create"
                  kind={kind}
                  submitLabel={`Create ${entityNoun(kind)}`}
                  onCancel={() => setCreating(false)}
                  onSubmit={submitCreate}
                />
              )}
            </AnimatePresence>
            {rows.length === 0 ? null : viewRows.length === 0 ? (
              <p className="px-1 py-6 text-center text-[13px] text-theme-dim">
                No {entityNounPlural(kind)} match “{filter}”.
              </p>
            ) : (
              <EntityList
              store={store}
              rows={viewRows}
              kind={kind}
              canMerge={rows.length > 1}
              expandedId={expandedId}
              editingId={editingId}
              recoloringId={recoloringId}
              onToggleExpand={(id) => setExpandedId((current) => (current === id ? null : id))}
              onRename={(row) => {
                setRecoloringId(null);
                setEditingId(row.id);
              }}
              onSubmitRename={submitRename}
              onCancelRename={() => setEditingId(null)}
              onRecolor={(row) => {
                setEditingId(null);
                setRecoloringId((current) => (current === row.id ? null : row.id));
              }}
              onSubmitRecolor={(id, color) => {
                commit([buildRecolor(kind, id, color)]);
                setRecoloringId(null);
              }}
              onCancelRecolor={() => setRecoloringId(null)}
              onDelete={(row) => setPending({ mode: "delete", row })}
              onMerge={(row) => setPending({ mode: "merge", row })}
              onOpenNote={openNote}
              />
            )}
          </div>
        </div>
      )}

      <Dialog
        open={pending?.mode === "delete"}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        title={`Delete ${entityNoun(kind)}?`}
      >
        {pending?.mode === "delete" && (
          <div className="grid gap-3.5">
            <p className="text-[13px] leading-normal text-foreground/86">
              “{pending.row.name}” will be removed from{" "}
              {pending.row.noteCount === 1 ? "1 note" : `${pending.row.noteCount} notes`}. Its label
              stays in those notes but resolves as unresolved.
            </p>
            <div className="mt-1 flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Cancel</Button>
              <Button
                variant="dangerFilled"
                onClick={() => {
                  commit([buildDelete(kind, pending.row.id)]);
                  setPending(null);
                }}
              >
                Delete {entityNoun(kind)}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={pending?.mode === "merge"}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        title={`Merge ${entityNoun(kind)}`}
      >
        {pending?.mode === "merge" && (
          <div className="grid gap-3.5">
            <p className="text-[13px] leading-normal text-foreground/86">
              Move every reference to “{pending.row.name}” onto another {entityNoun(kind)}, then
              delete “{pending.row.name}”.
            </p>
            <ul className="my-1 flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
              {rows
                .filter((row) => row.id !== pending.row.id)
                .map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-foreground hover:border-border hover:bg-theme-active/60 focus-visible:border-border focus-visible:bg-theme-active/60"
                      onClick={() => {
                        mergeInto(pending.row, target.id);
                        setPending(null);
                      }}
                    >
                      <span
                        className={entitySwatchClass}
                        style={{ background: target.color ?? "transparent" }}
                        data-empty={target.color === null ? "" : undefined}
                        aria-hidden="true"
                      >
                        {kind === "person" && target.initials ? target.initials : null}
                      </span>
                      <span className="flex-1 truncate text-[13px] font-[560]">{target.name}</span>
                      <span className={entityNoteCountClass}>
                        {target.noteCount} {target.noteCount === 1 ? "note" : "notes"}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            <div className="mt-1 flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Dialog>
    </main>
  );
}

type EntityListProps = {
  store: RendererStore;
  rows: readonly EntityRow[];
  kind: EntityKind;
  canMerge: boolean;
  expandedId: string | null;
  editingId: string | null;
  recoloringId: string | null;
  onToggleExpand: (id: string) => void;
  onRename: (row: EntityRow) => void;
  onSubmitRename: (id: string, value: string) => void;
  onCancelRename: () => void;
  onRecolor: (row: EntityRow) => void;
  onSubmitRecolor: (id: string, color: string | null) => void;
  onCancelRecolor: () => void;
  onDelete: (row: EntityRow) => void;
  onMerge: (row: EntityRow) => void;
  onOpenNote: (noteId: string) => void;
};

function EntityList({
  store,
  rows,
  kind,
  canMerge,
  expandedId,
  editingId,
  recoloringId,
  onToggleExpand,
  onRename,
  onSubmitRename,
  onCancelRename,
  onRecolor,
  onSubmitRecolor,
  onCancelRecolor,
  onDelete,
  onMerge,
  onOpenNote,
}: EntityListProps) {
  const ref = useRef<HTMLUListElement>(null);

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
    <ul ref={ref} className="py-1" aria-label={titleFor(kind)}>
      {rows.map((row, index) => (
        <li
          key={row.id}
          data-entity-row=""
          className={entityRowClass}
        >
          {editingId === row.id ? (
            <div className="flex items-center gap-2 py-1.5 pl-1.5 pr-2">
              <EntityRenameField
                kind={kind}
                row={row}
                onSubmit={(value) => onSubmitRename(row.id, value)}
                onCancel={onCancelRename}
              />
            </div>
          ) : (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex items-center gap-2 py-1.5 pl-1.5 pr-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-foreground"
                    data-entity-id={row.id}
                    aria-expanded={expandedId === row.id}
                    onClick={() => onToggleExpand(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        focusRow(index + 1);
                        event.preventDefault();
                      } else if (event.key === "ArrowUp") {
                        focusRow(index - 1);
                        event.preventDefault();
                      } else if (event.key === "Home") {
                        focusRow(0);
                        event.preventDefault();
                      } else if (event.key === "End") {
                        focusRow(rows.length - 1);
                        event.preventDefault();
                      }
                    }}
                  >
                    <span
                      className={entitySwatchClass}
                      style={{ background: row.color ?? "transparent" }}
                      data-empty={row.color === null ? "" : undefined}
                      aria-hidden="true"
                    >
                      {kind === "person" && row.initials ? row.initials : null}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-[560]">{row.name}</span>
                    <span className={entityNoteCountClass}>
                      {row.noteCount} {row.noteCount === 1 ? "note" : "notes"}
                    </span>
                    {row.createdAt > 0 && (
                      <span
                        className="shrink truncate text-[10px] text-theme-dim before:mr-1.5 before:text-[hsl(var(--theme-border))] before:content-['·']"
                        title={createdTooltip(row)}
                      >
                        created {formatRelativeTime(row.createdAt)}
                        {row.createdInTitle ? ` in ${row.createdInTitle}` : null}
                      </span>
                    )}
                  </button>
                  <div className="flex gap-0.5">
                    <Tooltip label="Actions" side="top">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                          entityFocusRingClass,
                        )}
                        aria-label={`Actions for ${row.name}`}
                        onClick={openRowMenu}
                      >
                        <MoreHorizontalIcon size={16} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem className="gap-2" onSelect={() => onRename(row)}>
                  <PencilIcon size={14} />
                  Rename
                </ContextMenuItem>
                <ContextMenuItem className="gap-2" onSelect={() => onRecolor(row)}>
                  <PaletteIcon size={14} />
                  Recolor
                </ContextMenuItem>
                {canMerge && (
                  <ContextMenuItem className="gap-2" onSelect={() => onMerge(row)}>
                    <WaypointsIcon size={14} />
                    Merge into…
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onSelect={() => onDelete(row)}
                >
                  <Trash2Icon size={14} />
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )}
          <AnimatePresence initial={false}>
            {recoloringId === row.id && (
              <InlineRecolor
                key="recolor"
                row={row}
                kind={kind}
                onSelect={(color) => onSubmitRecolor(row.id, color)}
                onCancel={onCancelRecolor}
              />
            )}
          </AnimatePresence>
          {expandedId === row.id && (
            <ReferencingNotes
              store={store}
              kind={kind}
              targetId={row.id}
              onOpenNote={onOpenNote}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Opens the row's Radix context menu from a left-click on the kebab by
 * re-dispatching a `contextmenu` event at the button, so the pointer menu and
 * the kebab menu stay a single definition.
 */
function openRowMenu(event: MouseEvent<HTMLButtonElement>): void {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  button.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: rect.right,
      clientY: rect.bottom,
    }),
  );
}

const createdTooltipFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function createdTooltip(row: EntityRow): string {
  const created = `Created ${createdTooltipFormatter.format(new Date(row.createdAt))}`;
  if (row.updatedAt > row.createdAt) {
    return `${created} · updated ${createdTooltipFormatter.format(new Date(row.updatedAt))}`;
  }
  return created;
}

type EntityRenameFieldProps = {
  kind: EntityKind;
  row: EntityRow;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

function EntityRenameField({ kind, row, onSubmit, onCancel }: EntityRenameFieldProps) {
  return (
    <InlineEdit
      defaultValue={row.name}
      ariaLabel={`Rename ${entityNoun(kind)} ${row.name}`}
      onSubmit={onSubmit}
      onCancel={onCancel}
      leading={
        <span
          className={entitySwatchClass}
          style={{ background: row.color ?? "transparent" }}
          data-empty={row.color === null ? "" : undefined}
          aria-hidden="true"
        >
          {kind === "person" && row.initials ? row.initials : null}
        </span>
      }
    />
  );
}

type ReferencingNotesProps = {
  store: RendererStore;
  kind: EntityKind;
  targetId: string;
  onOpenNote: (noteId: string) => void;
};

function ReferencingNotes({ store, kind, targetId, onOpenNote }: ReferencingNotesProps) {
  const selector = useCallback(
    (state: Parameters<typeof projectReferencingNotes>[0]) =>
      projectReferencingNotes(state, kind, targetId),
    [kind, targetId],
  );
  const entries = useRendererSelector(store, selector, backlinksEqual);
  if (entries.length === 0) {
    return (
      <p className="pb-2 pl-11 pr-2 text-xs text-theme-dim">
        No notes reference this {entityNoun(kind)}.
      </p>
    );
  }
  return (
    <ul className="pb-2 pl-11 pr-2" aria-label={`Notes referencing ${entityNoun(kind)}`}>
      {entries.map((entry) => (
        <li key={entry.noteId}>
          <button
            type="button"
            className={cn(
              "w-full cursor-pointer rounded-lg px-2 py-1 text-left text-xs text-foreground/80 hover:bg-muted/60",
              entityFocusRingClass,
            )}
            onClick={() => onOpenNote(entry.noteId)}
          >
            {entry.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

type FormFields = {
  name: string;
  color: string | null;
  initials: string;
  note: string;
};

type InlineEntityFormProps = {
  kind: EntityKind;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fields: FormFields) => void;
};

const fieldInputClass =
  "min-w-0 rounded-lg border border-border bg-background px-[9px] py-[6px] text-[13px] text-foreground outline-none transition-colors duration-[130ms] ease-out placeholder:text-theme-dim focus:border-ring focus:bg-theme-hover";

const personAvatarClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tracking-[0.02em] text-background transition-[background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-empty:border data-empty:border-dashed data-empty:border-border data-empty:bg-transparent data-empty:text-theme-dim";

const fieldLabelClass = "shrink-0 text-[11px] font-[560] tracking-[0.01em] text-theme-secondary";

const inlineFormShell: Variants = {
  hidden: { opacity: 0, height: 0 },
  shown: {
    opacity: 1,
    height: "auto",
    transition: {
      height: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
      opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
      staggerChildren: 0.03,
      delayChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { duration: 0.17, ease: [0.32, 0.72, 0, 1] },
      opacity: { duration: 0.1, ease: "easeOut" },
    },
  },
};

const inlineFormRow: Variants = {
  hidden: { opacity: 0, transform: "translateY(-4px)" },
  shown: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

function InlineEntityForm({ kind, submitLabel, onCancel, onSubmit }: InlineEntityFormProps) {
  const reduceMotion = useReducedMotion();
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
    <motion.div
      className="shrink-0 overflow-hidden"
      variants={reduceMotion ? undefined : inlineFormShell}
      initial={reduceMotion ? { opacity: 0 } : "hidden"}
      animate={reduceMotion ? { opacity: 1 } : "shown"}
      exit={reduceMotion ? { opacity: 0 } : "exit"}
    >
      <form
        className="mb-2 mt-3 grid gap-3 rounded-lg border border-border bg-theme-hover p-3"
        aria-label={`New ${entityNoun(kind)}`}
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
            rowVariants={reduceMotion ? undefined : inlineFormRow}
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
            rowVariants={reduceMotion ? undefined : inlineFormRow}
            onNameChange={setName}
            onColorChange={setColor}
          />
        )}
        <motion.div
          className="flex justify-end gap-2 border-t border-theme-divider pt-2.5"
          variants={reduceMotion ? undefined : inlineFormRow}
        >
          <Button className={inlinePressClass} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className={inlinePressClass}
            disabled={!canSubmit}
          >
            {submitLabel}
          </Button>
        </motion.div>
      </form>
    </motion.div>
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
          className={entitySwatchClass}
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
          className={personAvatarClass}
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

type InlineRecolorProps = {
  row: EntityRow;
  kind: EntityKind;
  onSelect: (color: string | null) => void;
  onCancel: () => void;
};

const recolorStrip: Variants = {
  hidden: { opacity: 0, height: 0 },
  shown: {
    opacity: 1,
    height: "auto",
    transition: {
      height: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
      opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
      staggerChildren: 0.026,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { duration: 0.16, ease: [0.32, 0.72, 0, 1] },
      opacity: { duration: 0.1, ease: "easeOut" },
    },
  },
};

const recolorDot: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  shown: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, scale: 0.5, transition: { duration: 0.08 } },
};

function InlineRecolor({ row, kind, onSelect, onCancel }: InlineRecolorProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  return (
    <motion.div
      className="overflow-hidden"
      variants={reduceMotion ? undefined : recolorStrip}
      initial={reduceMotion ? { opacity: 0 } : "hidden"}
      animate={reduceMotion ? { opacity: 1 } : "shown"}
      exit={reduceMotion ? { opacity: 0 } : "exit"}
    >
      <ColorSwatchRow
        ref={ref}
        className="mb-2 ml-11 mr-2 mt-0.5"
        label={`Recolor ${entityNoun(kind)} ${row.name}`}
        value={row.color}
        dotVariants={recolorDot}
        onChange={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </motion.div>
  );
}
