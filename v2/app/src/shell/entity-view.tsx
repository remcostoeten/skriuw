import { useCallback, useMemo, useRef, useState } from "react";
import { activateNote, commitReferenceOperations } from "../actions/workspace";
import { appRouteHash } from "../app-route";
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
import { CircleIcon, PencilIcon, Trash2Icon, WaypointsIcon } from "../shared/icons";
import { Dialog } from "../shared/ui/dialog";
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
  | { mode: "rename"; row: EntityRow }
  | { mode: "recolor"; row: EntityRow }
  | { mode: "delete"; row: EntityRow };

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
  const [pending, setPending] = useState<Pending | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function commit(operations: readonly ReferenceOperation[]): void {
    commitReferenceOperations(store, operations);
  }

  function openNote(noteId: string): void {
    activateNote(store, noteId);
    window.location.hash = appRouteHash("notes");
  }

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
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="entity-empty">
          <span className="entity-empty-icon" aria-hidden="true">
            {kind === "tag" ? <WaypointsIcon size={22} /> : <CircleIcon size={22} />}
          </span>
          <h2>No {entityNounPlural(kind)} yet</h2>
          <p>
            Create {entityNounPlural(kind)} here or by typing {kind === "tag" ? "#" : "@"} while
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
        <EntityList
          store={store}
          rows={rows}
          kind={kind}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId((current) => (current === id ? null : id))}
          onRename={(row) => setPending({ mode: "rename", row })}
          onRecolor={(row) => setPending({ mode: "recolor", row })}
          onDelete={(row) => setPending({ mode: "delete", row })}
          onOpenNote={openNote}
        />
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

      {pending?.mode === "rename" && (
        <EntityForm
          kind={kind}
          title={`Rename ${entityNoun(kind)}`}
          submitLabel="Save name"
          nameOnly
          initial={pending.row}
          onClose={() => setPending(null)}
          onSubmit={(fields) => {
            const operation = buildRename(kind, pending.row.id, fields.name);
            if (operation) {
              commit([operation]);
            }
            setPending(null);
          }}
        />
      )}

      {pending?.mode === "recolor" && (
        <RecolorDialog
          row={pending.row}
          onClose={() => setPending(null)}
          onSubmit={(color) => {
            commit([buildRecolor(kind, pending.row.id, color)]);
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
        className="entity-confirm-dialog"
      >
        {pending?.mode === "delete" && (
          <>
            <p>
              “{pending.row.name}” will be removed. Its label stays in existing notes but resolves
              as unresolved.
            </p>
            <div className="entity-confirm-actions">
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
          </>
        )}
      </Dialog>
    </main>
  );
}

type EntityListProps = {
  store: RendererStore;
  rows: readonly EntityRow[];
  kind: EntityKind;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onRename: (row: EntityRow) => void;
  onRecolor: (row: EntityRow) => void;
  onDelete: (row: EntityRow) => void;
  onOpenNote: (noteId: string) => void;
};

function EntityList({
  store,
  rows,
  kind,
  expandedId,
  onToggleExpand,
  onRename,
  onRecolor,
  onDelete,
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
            </button>
            <div className="entity-row-actions">
              <Tooltip label="Rename" side="top">
                <button
                  type="button"
                  className="entity-icon-button"
                  aria-label={`Rename ${row.name}`}
                  onClick={() => onRename(row)}
                >
                  <PencilIcon size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Recolor" side="top">
                <button
                  type="button"
                  className="entity-icon-button entity-recolor-button"
                  aria-label={`Recolor ${row.name}`}
                  onClick={() => onRecolor(row)}
                >
                  <span
                    className="entity-recolor-dot"
                    style={{ background: row.color ?? "transparent" }}
                    data-empty={row.color === null ? "" : undefined}
                    aria-hidden="true"
                  />
                </button>
              </Tooltip>
              <Tooltip label="Delete" side="top">
                <button
                  type="button"
                  className="entity-icon-button entity-icon-button-danger"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => onDelete(row)}
                >
                  <Trash2Icon size={14} />
                </button>
              </Tooltip>
            </div>
          </div>
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
  nameOnly?: boolean;
  initial?: EntityRow;
  onClose: () => void;
  onSubmit: (fields: FormFields) => void;
};

function EntityForm({
  kind,
  title,
  submitLabel,
  nameOnly = false,
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
        {!nameOnly && kind === "person" && (
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
        {!nameOnly && (
          <div className="entity-field">
            <span>Color</span>
            <ColorSwatches value={color} onChange={setColor} />
          </div>
        )}
        {!nameOnly && kind === "person" && (
          <label className="entity-field">
            <span>Note</span>
            <textarea
              value={note}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        )}
        <div className="entity-confirm-actions">
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

type RecolorDialogProps = {
  row: EntityRow;
  onClose: () => void;
  onSubmit: (color: string | null) => void;
};

function RecolorDialog({ row, onClose, onSubmit }: RecolorDialogProps) {
  const [color, setColor] = useState<string | null>(row.color);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())} title={`Recolor ${row.name}`}>
      <div className="entity-form">
        <div className="entity-field">
          <span>Color</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <div className="entity-confirm-actions">
          <button type="button" className="entity-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="entity-button entity-button-primary is-filled"
            onClick={() => onSubmit(color)}
          >
            Save color
          </button>
        </div>
      </div>
    </Dialog>
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
