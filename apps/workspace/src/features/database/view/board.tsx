import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { DatabaseGroup } from "@skriuw/renderer-core/database/arrange";
import type { DatabaseColumn } from "@skriuw/renderer-core/database/columns";
import type { DatabaseRow } from "@skriuw/renderer-core/database/rows";
import { groupInput } from "@skriuw/renderer-core/database/writes";
import type { PersonRecord } from "@skriuw/renderer-core/references/types";
import { EMPTY_STATE_COLORS } from "@/shared/empty-state/app-theme";
import { EmptyState } from "@/shared/empty-state/empty-state";
import { ProjectIllustration } from "@/shared/empty-state/illustrations";
import { PlusIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { CheckGlyph, StarGlyph } from "./glyphs";
import { nextCardPosition } from "./grid-keys";
import { OptionDot, OptionLabel } from "./option-pill";
import { iconButtonClass, quietActionClass } from "./styles";
import type { DatabaseModel } from "./use-database";
import { cellDisplay, type CellDisplay } from "./values";

type Props = {
  model: DatabaseModel;
  onOpenNote: (noteId: string) => void;
  embedded?: boolean;
};

type CardActions = {
  open: (noteId: string) => void;
  keyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    row: DatabaseRow,
    groupIndex: number,
    index: number,
  ) => void;
  focus: (noteId: string) => void;
  dragStart: (event: DragEvent<HTMLButtonElement>, noteId: string) => void;
  dragEnd: () => void;
};

const PAGE_SIZE = 50;
const CARD_FIELDS = 4;
const NOTE_DRAG_TYPE = "application/x-skriuw-database-note";
const NO_VALUE_KEY = "\u0000none";
const WIDE_FIELD_TYPES: ReadonlySet<string> = new Set([
  "text",
  "url",
  "location",
  "email",
  "phone",
  "person",
]);

function groupId(group: DatabaseGroup): string {
  return group.key ?? NO_VALUE_KEY;
}

/**
 * The board layout: one column per option of the grouping property, cards in
 * the view's sort order, and moves by drag and drop or Alt with the arrow
 * keys. A move writes the grouping property on the note.
 */
export function DatabaseBoard({ model, onOpenNote, embedded = false }: Props) {
  const idPrefix = useId();
  const { arranged, groupColumn, visible, people } = model;
  const groups = useMemo(
    () =>
      embedded
        ? (arranged.groups?.filter((group) => group.key !== null || group.rows.length > 0) ?? null)
        : arranged.groups,
    [arranged.groups, embedded],
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const focusNoteId = useRef<string | null>(null);
  const [limits, setLimits] = useState<Readonly<Record<string, number>>>({});
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const fields = useMemo(
    () =>
      visible
        .filter((column) => column.key !== "title" && column.key !== groupColumn?.key)
        .slice(0, CARD_FIELDS),
    [visible, groupColumn],
  );
  const shown = useMemo(
    () => (groups ?? []).map((group) => group.rows.slice(0, limits[groupId(group)] ?? PAGE_SIZE)),
    [groups, limits],
  );
  const firstNoteId = shown.find((cards) => cards.length > 0)?.[0]?.noteId ?? null;
  const tabStop =
    activeNoteId !== null && shown.some((cards) => cards.some((row) => row.noteId === activeNoteId))
      ? activeNoteId
      : firstNoteId;

  const latest = useRef({ onCardKeyDown, onOpenNote });
  latest.current = { onCardKeyDown, onOpenNote };
  const actions = useMemo<CardActions>(
    () => ({
      open(noteId) {
        latest.current.onOpenNote(noteId);
      },
      keyDown(event, row, groupIndex, index) {
        latest.current.onCardKeyDown(event, row, groupIndex, index);
      },
      focus(noteId) {
        setActiveNoteId(noteId);
      },
      dragStart(event, noteId) {
        event.dataTransfer.setData(NOTE_DRAG_TYPE, noteId);
        event.dataTransfer.effectAllowed = "move";
        setDragging(noteId);
      },
      dragEnd() {
        setDragging(null);
        setDropTarget(null);
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    const noteId = focusNoteId.current;
    if (noteId === null) return;
    const card = boardRef.current?.querySelector<HTMLElement>(
      `[data-note-id="${CSS.escape(noteId)}"]`,
    );
    if (!card) return;
    focusNoteId.current = null;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  function focusCard(noteId: string): void {
    setActiveNoteId(noteId);
    focusNoteId.current = noteId;
  }

  function move(row: DatabaseRow, target: DatabaseGroup): void {
    if (groupColumn === null) return;
    const input = groupInput(groupColumn, target.key);
    if (input === null) return;
    model.writeCell(row.noteId, groupColumn, input);
    focusCard(row.noteId);
  }

  function onCardKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    row: DatabaseRow,
    groupIndex: number,
    index: number,
  ): void {
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const target = groups?.[groupIndex + (event.key === "ArrowLeft" ? -1 : 1)];
      if (target) move(row, target);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = nextCardPosition(
      event.key,
      groupIndex,
      index,
      shown.map((cards) => cards.length),
    );
    if (next === null) return;
    event.preventDefault();
    const noteId = shown[next[0]]?.[next[1]]?.noteId;
    if (noteId) focusCard(noteId);
  }

  function onDragOver(event: DragEvent<HTMLElement>, group: DatabaseGroup): void {
    if (dragging === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget !== groupId(group)) setDropTarget(groupId(group));
  }

  function onDrop(event: DragEvent<HTMLElement>, group: DatabaseGroup): void {
    event.preventDefault();
    const noteId = event.dataTransfer.getData(NOTE_DRAG_TYPE) || dragging;
    setDragging(null);
    setDropTarget(null);
    const row = arranged.rows.find((entry) => entry.noteId === noteId);
    if (row) move(row, group);
  }

  if (groupColumn === null || groups === null) {
    return (
      <div className="w-[min(480px,calc(100%-40px))] place-self-center">
        <EmptyState
          colors={EMPTY_STATE_COLORS}
          illustration={<ProjectIllustration />}
          title="Nothing to group by yet"
          description="A board groups notes by a select or checkbox property. Add one, such as Status, to a note in this view."
        />
      </div>
    );
  }

  return (
    <div
      ref={boardRef}
      className={embedded ? "overflow-x-auto" : "min-h-0 overflow-auto"}
      aria-describedby={embedded ? undefined : "database-keyboard-help"}
    >
      <div
        className={cn(
          "flex items-start",
          embedded
            ? "w-full gap-4 px-3.5 pb-3"
            : "min-h-full w-max gap-5 px-[var(--db-gutter)] pb-10",
        )}
      >
        {groups.map((group, groupIndex) => {
          const id = groupId(group);
          const cards = shown[groupIndex] ?? [];
          const remaining = group.rows.length - cards.length;
          const headingId = `${idPrefix}-group-${groupIndex}`;
          return (
            <section
              key={id}
              aria-labelledby={headingId}
              data-drop-target={dropTarget === id || undefined}
              className={cn(
                "database-column group/column flex flex-col",
                embedded
                  ? "max-w-[320px] min-w-[204px] flex-[1_0_204px]"
                  : group.key === null && group.rows.length === 0 && adding !== id
                    ? "w-[148px] shrink-0"
                    : "w-[272px] shrink-0",
              )}
              onDragOver={(event) => onDragOver(event, group)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(event) => onDrop(event, group)}
            >
              <header
                className={cn(
                  "flex h-9 items-center gap-2 border-b border-theme-divider/85 bg-theme-editor pl-0.5",
                  !embedded && "sticky top-0 z-[1]",
                )}
              >
                {group.key === null ? null : <OptionDot color={group.color} />}
                <h2
                  id={headingId}
                  className={cn(
                    "min-w-0 truncate text-[13px] font-medium tracking-[-0.005em]",
                    group.key === null ? "text-theme-secondary" : "text-foreground",
                  )}
                >
                  {group.label}
                </h2>
                <span className="text-[10.5px] tabular-nums text-theme-dim">
                  {group.rows.length}
                </span>
                <button
                  type="button"
                  aria-label={`New note in ${group.label}`}
                  title="New note"
                  disabled={model.status !== "ready"}
                  className={cn(
                    iconButtonClass,
                    "ml-auto size-6 text-theme-dim pointer-fine:opacity-0 pointer-fine:group-hover/column:opacity-100 pointer-fine:focus-visible:opacity-100",
                  )}
                  onClick={() => setAdding(id)}
                >
                  <PlusIcon size={12} />
                </button>
              </header>
              <div className="database-column-body mt-2 flex min-h-11 flex-col">
                {cards.length === 0 && adding !== id ? (
                  <p className="m-0 flex h-11 items-center px-3 text-xs text-theme-dim">No notes</p>
                ) : (
                  <ul
                    aria-labelledby={headingId}
                    className="m-0 flex list-none flex-col gap-1.5 p-0"
                  >
                    {cards.map((row, index) => (
                      <li key={row.noteId}>
                        <BoardCard
                          row={row}
                          groupIndex={groupIndex}
                          index={index}
                          fields={fields}
                          people={people}
                          tabStop={tabStop === row.noteId}
                          dragging={dragging === row.noteId}
                          actions={actions}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {remaining > 0 && (
                  <button
                    type="button"
                    className={cn(quietActionClass, "mt-1.5 self-start")}
                    onClick={() =>
                      setLimits((current) => ({ ...current, [id]: cards.length + PAGE_SIZE }))
                    }
                  >
                    Show {Math.min(PAGE_SIZE, remaining)} more
                  </button>
                )}
                {adding === id && (
                  <NewCard
                    label={group.label}
                    onCreate={(title) => model.createNote(title, group.key) !== null}
                    onClose={() => setAdding(null)}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type CardProps = {
  row: DatabaseRow;
  groupIndex: number;
  index: number;
  fields: readonly DatabaseColumn[];
  people: ReadonlyMap<string, PersonRecord>;
  tabStop: boolean;
  dragging: boolean;
  actions: CardActions;
};

const BoardCard = memo(function BoardCard({
  row,
  groupIndex,
  index,
  fields,
  people,
  tabStop,
  dragging,
  actions,
}: CardProps) {
  const values = fields.flatMap((column) => {
    const display = cellDisplay(row, column, people);
    return display.kind === "empty" || (display.kind === "checkbox" && !display.checked)
      ? []
      : [{ column, display }];
  });
  return (
    <button
      type="button"
      draggable
      data-note-id={row.noteId}
      tabIndex={tabStop ? 0 : -1}
      data-dragging={dragging || undefined}
      className="database-card"
      onClick={() => actions.open(row.noteId)}
      onKeyDown={(event) => actions.keyDown(event, row, groupIndex, index)}
      onFocus={() => actions.focus(row.noteId)}
      onDragStart={(event) => actions.dragStart(event, row.noteId)}
      onDragEnd={actions.dragEnd}
    >
      <span className="line-clamp-2 text-[13px] font-medium leading-[1.35] text-foreground [overflow-wrap:anywhere]">
        {row.title.trim() || "Untitled"}
      </span>
      {values.length > 0 && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] leading-[1.4] text-theme-dim">
          {values.map(({ column, display }) => (
            <CardField
              key={column.key}
              name={column.name}
              display={display}
              wide={column.kind === "property" && WIDE_FIELD_TYPES.has(column.type)}
              trailing={column.kind === "built-in"}
            />
          ))}
        </span>
      )}
    </button>
  );
});

type FieldProps = {
  name: string;
  display: CellDisplay;
  wide: boolean;
  trailing: boolean;
};

function CardField({ name, display, wide, trailing }: FieldProps) {
  switch (display.kind) {
    case "options":
      return (
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 text-theme-secondary">
          <span className="sr-only">{name}: </span>
          {display.options.map((option, index) => (
            <OptionLabel
              key={`${option.label}:${index}`}
              label={option.label}
              color={option.color}
              className="gap-1.5"
            />
          ))}
        </span>
      );
    case "checkbox":
      return (
        <span className="inline-flex items-center gap-1 text-theme-secondary [&>svg]:size-[11px] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-2">
          <CheckGlyph />
          {name}
        </span>
      );
    case "rating":
      return (
        <span
          className="inline-flex items-center gap-px text-theme-secondary [&>svg]:size-[10px] [&>svg]:fill-current"
          aria-label={`${name}: ${display.value} of 5`}
        >
          {Array.from({ length: display.value }, (_, index) => (
            <StarGlyph key={index} />
          ))}
        </span>
      );
    case "empty":
      return null;
    default:
      return (
        <span
          className={cn(
            "min-w-0 max-w-full truncate tabular-nums",
            wide && "basis-full text-theme-secondary",
            trailing && "ml-auto",
          )}
        >
          <span className="sr-only">{name}: </span>
          {display.text}
        </span>
      );
  }
}

function NewCard({
  label,
  onCreate,
  onClose,
}: {
  label: string;
  onCreate: (title: string) => boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <form
      className="mt-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (onCreate(draft)) setDraft("");
      }}
    >
      <input
        ref={inputRef}
        autoComplete="off"
        aria-label={`New note in ${label}`}
        placeholder="Name the note, then press Enter"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() === "") onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        className="h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-[border-color] duration-150 placeholder:text-theme-dim focus-visible:border-ring"
      />
    </form>
  );
}
