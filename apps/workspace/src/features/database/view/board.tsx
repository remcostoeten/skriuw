import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { DatabaseGroup } from "@skriuw/renderer-core/database/arrange";
import type { DatabaseColumn } from "@skriuw/renderer-core/database/columns";
import type { DatabaseRow } from "@skriuw/renderer-core/database/rows";
import { groupInput } from "@skriuw/renderer-core/database/writes";
import type { PersonRecord } from "@skriuw/renderer-core/references/types";
import { LayoutDashboardIcon, PlusIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { nextCardPosition } from "./grid-keys";
import { OptionDot, OptionPill } from "./option-pill";
import { iconButtonClass } from "./styles";
import type { DatabaseModel } from "./use-database";
import { cellDisplay, type CellDisplay } from "./values";

type Props = {
  model: DatabaseModel;
  onOpenNote: (noteId: string) => void;
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

function groupId(group: DatabaseGroup): string {
  return group.key ?? NO_VALUE_KEY;
}

/**
 * The board layout: one column per option of the grouping property, cards in
 * the view's sort order, and moves by drag and drop or Alt with the arrow
 * keys. A move writes the grouping property on the note.
 */
export function DatabaseBoard({ model, onOpenNote }: Props) {
  const { arranged, groupColumn, visible, people } = model;
  const groups = arranged.groups;
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
      <div
        role="status"
        className="w-[min(380px,calc(100%-40px))] place-self-center text-center text-theme-secondary"
      >
        <span className="mb-3.5 inline-flex text-theme-dim" aria-hidden="true">
          <LayoutDashboardIcon size={22} />
        </span>
        <h2 className="text-[15px] font-[620] text-foreground">Nothing to group by yet</h2>
        <p className="mt-1.5 text-xs leading-[1.45]">
          A board groups notes by a select or checkbox property. Add one, such as Status, to a note
          in this view.
        </p>
      </div>
    );
  }

  return (
    <div ref={boardRef} className="min-h-0 overflow-auto" aria-describedby="database-keyboard-help">
      <div className="flex min-h-full w-max items-start gap-3 px-[clamp(20px,4vw,40px)] pb-6 pt-1">
        {groups.map((group, groupIndex) => {
          const id = groupId(group);
          const cards = shown[groupIndex] ?? [];
          const remaining = group.rows.length - cards.length;
          const headingId = `database-group-${groupIndex}`;
          return (
            <section
              key={id}
              aria-labelledby={headingId}
              data-drop-target={dropTarget === id || undefined}
              className="flex w-[272px] shrink-0 flex-col rounded-lg bg-[hsl(var(--foreground)/0.025)] outline-offset-[-1px] data-[drop-target]:outline data-[drop-target]:outline-1 data-[drop-target]:outline-foreground/30"
              onDragOver={(event) => onDragOver(event, group)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(event) => onDrop(event, group)}
            >
              <header className="flex h-9 items-center gap-2 pl-2.5 pr-1">
                {group.key === null ? null : <OptionDot color={group.color} />}
                <h2
                  id={headingId}
                  className="min-w-0 truncate text-[12px] font-medium text-foreground"
                >
                  {group.label}
                </h2>
                <span className="font-mono text-[10px] text-theme-dim">{group.rows.length}</span>
                <button
                  type="button"
                  aria-label={`New note in ${group.label}`}
                  title="New note"
                  disabled={model.status !== "ready"}
                  className={cn(iconButtonClass, "ml-auto size-6")}
                  onClick={() => setAdding(id)}
                >
                  <PlusIcon size={12} />
                </button>
              </header>
              <ul aria-labelledby={headingId} className="flex flex-col gap-1.5 px-1.5 pb-1.5">
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
              {remaining > 0 && (
                <button
                  type="button"
                  className="mx-1.5 mb-1.5 h-7 cursor-pointer rounded-md text-[12px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
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
      className="flex w-full cursor-pointer flex-col gap-1.5 rounded-md border border-border/70 bg-theme-editor px-2.5 py-2 text-left outline-none transition-[border-color,opacity] hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:shadow-[0_0_0_1px_hsl(var(--foreground)/0.35)] data-[dragging]:opacity-50"
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
        <span className="flex flex-col gap-1">
          {values.map(({ column, display }) => (
            <CardField key={column.key} name={column.name} display={display} />
          ))}
        </span>
      )}
    </button>
  );
});

function CardField({ name, display }: { name: string; display: CellDisplay }) {
  switch (display.kind) {
    case "options":
      return (
        <span className="flex flex-wrap gap-1">
          <span className="sr-only">{name}: </span>
          {display.options.map((option, index) => (
            <OptionPill
              key={`${option.label}:${index}`}
              label={option.label}
              color={option.color}
            />
          ))}
        </span>
      );
    case "checkbox":
      return <span className="text-[11px] text-muted-foreground">{name}</span>;
    case "rating":
      return (
        <span
          className="text-[11px] text-muted-foreground"
          aria-label={`${name}: ${display.value} of 5`}
        >
          {"★".repeat(display.value)}
        </span>
      );
    case "empty":
      return null;
    default:
      return (
        <span className="truncate text-[11px] text-muted-foreground">
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
      className="mx-1.5 mb-1.5"
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
        className="h-8 w-full rounded-md border border-border bg-theme-editor px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/55 focus-visible:border-foreground/30"
      />
    </form>
  );
}
