import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useShortcutBinding } from "@remcostoeten/use-shortcut/react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { activateNote, commitOperations, commitReferenceOperations } from "../actions/workspace";
import { appRouteHash, useRouteFocus } from "../app-route";
import {
  ENTITY_COLORS,
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
} from "../references/entity-manager-model";
import { backlinksEqual, projectReferencingNotes } from "../references/reference-panel-model";
import { buildMergeSaveDocuments } from "../references/entity-merge";
import { registerEntityCreate } from "../references/entity-create-controller";
import {
  CheckIcon,
  CircleIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  WaypointsIcon,
} from "../shared/icons";
import { formatRelativeTime } from "../shared/lib/relative-time";
import { effectiveShortcutKeys, shortcutDefinition } from "../shortcuts/bindings";
import { sameOverrides, selectShortcutOverrides } from "./settings/selectors";
import { Dialog } from "../shared/ui/dialog";
import { InlineEdit } from "../shared/ui/inline-edit";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../shared/ui/context-menu";
import { Tooltip } from "../shared/ui/tooltip";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import type { ReferenceOperation } from "../references/types";

type Props = {
  store: RendererStore;
  kind: EntityKind;
};

type Pending =
  | { mode: "create" }
  | { mode: "delete"; row: EntityRow }
  | { mode: "merge"; row: EntityRow };

type SortMode = "name" | "recent" | "used";

const SORT_LABELS: Record<SortMode, string> = {
  name: "Name",
  recent: "Recently created",
  used: "Most used",
};

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

  useShortcutBinding(
    createCombo,
    () => setPending({ mode: "create" }),
    { description: `New ${entityNoun(kind)}`, preventDefault: true, scopes: "entity-create" },
    { activeScopes: ["entity-create"] },
  );

  useEffect(
    () => registerEntityCreate(kind, () => setPending({ mode: "create" })),
    [kind],
  );

  return (
    <main className="entity-view" aria-labelledby="entity-title">
      <header className="entity-header">
        <div>
          <div className="entity-heading-row">
            <h1 id="entity-title">{titleFor(kind)}</h1>
            {rows.length > 0 && <span className="entity-count">{rows.length}</span>}
          </div>
          <p>{descriptionFor(kind)}</p>
        </div>
        <button
          type="button"
          className="entity-button entity-button-primary"
          onClick={() => setPending({ mode: "create" })}
        >
          New {entityNoun(kind)}
          <kbd className="entity-kbd" aria-hidden="true">
            {formatShortcut(createCombo)}
          </kbd>
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="entity-empty">
          <span className="entity-empty-icon" aria-hidden="true">
            {kind === "tag" ? <WaypointsIcon size={22} /> : <CircleIcon size={22} />}
          </span>
          <h2>No {entityNounPlural(kind)} yet</h2>
          <p>
            Create {entityNounPlural(kind)} here or by typing {kind === "tag" ? "#" : "$"} while
            writing a note.
          </p>
          <button
            type="button"
            className="entity-button entity-button-primary"
            onClick={() => setPending({ mode: "create" })}
          >
            New {entityNoun(kind)}
          </button>
        </div>
      ) : (
        <div className="entity-body">
          <div className="entity-controls">
            <div className="entity-search">
              <SearchIcon size={14} aria-hidden="true" />
              <input
                type="search"
                className="entity-search-input"
                placeholder={`Filter ${entityNounPlural(kind)}`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label={`Filter ${entityNounPlural(kind)}`}
              />
            </div>
            <label className="entity-sort">
              <span className="entity-sort-label">Sort</span>
              <select
                className="entity-sort-select"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {SORT_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {viewRows.length === 0 ? (
            <p className="entity-no-matches">No {entityNounPlural(kind)} match “{filter}”.</p>
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
      )}

      {pending?.mode === "create" && (
        <EntityForm
          kind={kind}
          title={`New ${entityNoun(kind)}`}
          submitLabel={`Create ${entityNoun(kind)}`}
          onClose={() => setPending(null)}
          onSubmit={(fields) => {
            const id = crypto.randomUUID();
            const operation =
              kind === "tag"
                ? buildCreateTag(id, fields.name, fields.color)
                : buildCreatePerson(id, fields.name, fields.initials, fields.color, fields.note);
            if (operation) {
              commit([operation]);
            }
            setPending(null);
          }}
        />
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
          <div className="entity-form">
            <p className="entity-delete-copy">
              “{pending.row.name}” will be removed from{" "}
              {pending.row.noteCount === 1 ? "1 note" : `${pending.row.noteCount} notes`}. Its label
              stays in those notes but resolves as unresolved.
            </p>
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="entity-button" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="entity-button entity-button-danger is-filled"
                onClick={() => {
                  commit([buildDelete(kind, pending.row.id)]);
                  setPending(null);
                }}
              >
                Delete {entityNoun(kind)}
              </button>
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
          <div className="entity-form">
            <p className="entity-delete-copy">
              Move every reference to “{pending.row.name}” onto another {entityNoun(kind)}, then
              delete “{pending.row.name}”.
            </p>
            <ul className="entity-merge-list">
              {rows
                .filter((row) => row.id !== pending.row.id)
                .map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      className="entity-merge-option"
                      onClick={() => {
                        mergeInto(pending.row, target.id);
                        setPending(null);
                      }}
                    >
                      <span
                        className="entity-swatch"
                        style={{ background: target.color ?? "transparent" }}
                        data-empty={target.color === null ? "" : undefined}
                        aria-hidden="true"
                      >
                        {kind === "person" && target.initials ? target.initials : null}
                      </span>
                      <span className="entity-merge-name">{target.name}</span>
                      <span className="entity-note-count">
                        {target.noteCount} {target.noteCount === 1 ? "note" : "notes"}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="entity-button" onClick={() => setPending(null)}>
                Cancel
              </button>
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
    <ul ref={ref} className="entity-list" aria-label={titleFor(kind)}>
      {rows.map((row, index) => (
        <li key={row.id} className="entity-row">
          {editingId === row.id ? (
            <div className="entity-row-main">
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
                <div className="entity-row-main">
                  <button
                    type="button"
                    className="entity-row-summary"
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
                      className="entity-swatch"
                      style={{ background: row.color ?? "transparent" }}
                      data-empty={row.color === null ? "" : undefined}
                      aria-hidden="true"
                    >
                      {kind === "person" && row.initials ? row.initials : null}
                    </span>
                    <span className="entity-name">{row.name}</span>
                    <span className="entity-note-count">
                      {row.noteCount} {row.noteCount === 1 ? "note" : "notes"}
                    </span>
                    {row.createdAt > 0 && (
                      <span
                        className="entity-created"
                        title={createdTooltip(row)}
                      >
                        created {formatRelativeTime(row.createdAt)}
                        {row.createdInTitle ? ` in ${row.createdInTitle}` : null}
                      </span>
                    )}
                  </button>
                  <div className="entity-row-actions">
                    <Tooltip label="Actions" side="top">
                      <button
                        type="button"
                        className="entity-icon-button"
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
          className="entity-swatch"
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
    return <p className="entity-backlinks-empty">No notes reference this {entityNoun(kind)}.</p>;
  }
  return (
    <ul className="entity-backlinks" aria-label={`Notes referencing ${entityNoun(kind)}`}>
      {entries.map((entry) => (
        <li key={entry.noteId}>
          <button type="button" onClick={() => onOpenNote(entry.noteId)}>
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

type EntityFormProps = {
  kind: EntityKind;
  title: string;
  submitLabel: string;
  initial?: EntityRow;
  onClose: () => void;
  onSubmit: (fields: FormFields) => void;
};

function EntityForm({
  kind,
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: EntityFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [initials, setInitials] = useState(initial?.initials ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const initialsPlaceholder = useMemo(() => deriveInitials(name), [name]);
  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())} title={title}>
      <form
        className="entity-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            return;
          }
          onSubmit({ name, color, initials, note });
        }}
      >
        <label className="entity-field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {kind === "person" && (
          <label className="entity-field">
            <span>Initials</span>
            <input
              type="text"
              value={initials}
              placeholder={initialsPlaceholder}
              maxLength={4}
              onChange={(event) => setInitials(event.target.value)}
            />
          </label>
        )}
        <div className="entity-field">
          <span>Color</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        {kind === "person" && (
          <label className="entity-field">
            <span>Note</span>
            <textarea
              value={note}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="entity-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="entity-button entity-button-primary is-filled"
            disabled={!canSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
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
  const options = useMemo<Array<string | null>>(() => [null, ...ENTITY_COLORS], []);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  return (
    <motion.div
      className="entity-recolor"
      variants={reduceMotion ? undefined : recolorStrip}
      initial={reduceMotion ? { opacity: 0 } : "hidden"}
      animate={reduceMotion ? { opacity: 1 } : "shown"}
      exit={reduceMotion ? { opacity: 0 } : "exit"}
    >
      <div
        ref={ref}
        className="entity-recolor-inner"
        role="group"
        aria-label={`Recolor ${entityNoun(kind)} ${row.name}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        {options.map((option) => {
          const selected = row.color === option;
          return (
            <motion.button
              key={option ?? "none"}
              type="button"
              className="entity-recolor-dot"
              variants={reduceMotion ? undefined : recolorDot}
              whileTap={reduceMotion ? undefined : { scale: 0.86 }}
              style={option ? { background: option } : undefined}
              data-empty={option === null ? "" : undefined}
              aria-label={option ?? "No color"}
              aria-pressed={selected}
              onClick={() => onSelect(option)}
            >
              {selected ? <CheckIcon size={13} /> : null}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

type ColorSwatchesProps = {
  value: string | null;
  onChange: (color: string | null) => void;
};

function ColorSwatches({ value, onChange }: ColorSwatchesProps) {
  return (
    <div className="entity-swatches" role="group" aria-label="Color">
      <button
        type="button"
        className="entity-swatch-option"
        data-empty=""
        aria-label="No color"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      />
      {ENTITY_COLORS.map((option) => (
        <button
          key={option}
          type="button"
          className="entity-swatch-option"
          style={{ background: option }}
          aria-label={option}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        />
      ))}
    </div>
  );
}
