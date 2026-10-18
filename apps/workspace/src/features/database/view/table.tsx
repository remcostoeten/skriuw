import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import {
  rowProperty,
  type DatabaseColumn,
  type PropertyColumn,
} from "@skriuw/renderer-core/database/columns";
import type { DatabaseSort } from "@skriuw/renderer-core/database/config";
import type { DatabaseRow } from "@skriuw/renderer-core/database/rows";
import { emptyNotePropertyValue } from "@skriuw/renderer-core/properties/value";
import type { PersonRecord } from "@skriuw/renderer-core/references/types";
import { virtualTreeWindow } from "@skriuw/renderer-core/store/tree";
import { TYPE_ICON } from "@/features/note-chrome/property-editing";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ExternalLinkIcon,
  FolderIcon,
  HashIcon,
  PlusIcon,
  TypeIcon,
} from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { CellEditor, isPickerEditable, isTextEditable } from "./cell-editors";
import { nextGridPosition, ratingKey, type GridPosition } from "./grid-keys";
import { OptionPill } from "./option-pill";
import type { DatabaseModel } from "./use-database";
import { cellDisplay, displayText, type CellDisplay } from "./values";

type Props = {
  model: DatabaseModel;
  onOpenNote: (noteId: string) => void;
  onRename: (noteId: string, title: string) => void;
};

type ActiveCell = { noteId: string | null; columnKey: string; row: number; column: number };

type Editing = {
  noteId: string;
  columnKey: string;
  anchor: DOMRect;
  initialText: string | null;
};

type RowActions = {
  toggle: (row: DatabaseRow, column: PropertyColumn) => void;
  rate: (row: DatabaseRow, column: PropertyColumn, rating: number) => void;
  open: (noteId: string) => void;
  rename: (noteId: string, title: string | null) => void;
};

const ROW_PITCH = 36;
const HEADER_HEIGHT = 36;
const OVERSCAN_ROWS = 6;
const MAX_RENDERED_ROWS = 120;

function columnWidth(column: DatabaseColumn): number {
  if (column.kind === "built-in") {
    switch (column.key) {
      case "title":
        return 280;
      case "folder":
        return 200;
      case "words":
        return 96;
      default:
        return 136;
    }
  }
  switch (column.type) {
    case "number":
      return 112;
    case "checkbox":
      return 104;
    case "rating":
      return 128;
    case "date":
      return 140;
    case "select":
      return 168;
    default:
      return 200;
  }
}

function columnIcon(column: DatabaseColumn): ReactNode {
  if (column.kind === "property") {
    const Icon = TYPE_ICON[column.type];
    return <Icon size={12} aria-hidden="true" />;
  }
  switch (column.key) {
    case "folder":
      return <FolderIcon size={12} aria-hidden="true" />;
    case "words":
      return <HashIcon size={12} aria-hidden="true" />;
    case "title":
      return <TypeIcon size={12} aria-hidden="true" />;
    default:
      return <CalendarIcon size={12} aria-hidden="true" />;
  }
}

/** The sorts after a header click: ascending, then descending, then off. */
export function headerSorts(
  sorts: readonly DatabaseSort[],
  columnKey: string,
): readonly DatabaseSort[] {
  const primary = sorts[0];
  if (primary?.column !== columnKey) return [{ column: columnKey, direction: "asc" }];
  if (primary.direction === "asc") return [{ column: columnKey, direction: "desc" }];
  return [];
}

function cellFor(host: HTMLElement | null, row: number, column: number): HTMLElement | null {
  return host?.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`) ?? null;
}

function parseCell(element: Element): GridPosition | null {
  const value = element.getAttribute("data-cell");
  if (value === null) return null;
  const [row, column] = value.split(":").map(Number);
  return row === undefined || column === undefined ? null : { row, column };
}

/**
 * The table layout: an ARIA grid with one roving tab stop, virtualized rows
 * at a fixed pitch, a sticky header and Name column, and in-place editing.
 * The active cell follows its note when sorting moves the row.
 */
export function DatabaseTable({ model, onOpenNote, onRename }: Props) {
  const { arranged, visible, view, people } = model;
  const rows = arranged.rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const pointerWasActive = useRef(false);
  const [scrollRow, setScrollRow] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [active, setActive] = useState<ActiveCell>({
    noteId: null,
    columnKey: "title",
    row: 0,
    column: 0,
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const widths = useMemo(() => visible.map(columnWidth), [visible]);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.noteId, index])),
    [rows],
  );

  const position = resolvePosition(active, rows.length, visible, rowIndexById);
  const range = useMemo(
    () =>
      virtualTreeWindow(
        rows.length,
        scrollRow * ROW_PITCH,
        Math.max(ROW_PITCH, viewportHeight - HEADER_HEIGHT),
        ROW_PITCH,
        OVERSCAN_ROWS,
        MAX_RENDERED_ROWS,
      ),
    [rows.length, scrollRow, viewportHeight],
  );
  const activeRendered =
    position.row === 0 || (position.row - 1 >= range.start && position.row - 1 < range.end);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height !== undefined) setViewportHeight(height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    const cell = cellFor(gridRef.current, position.row, position.column);
    if (!cell) return;
    focusRequested.current = false;
    cell.focus({ preventScroll: true });
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  const latest = useRef({ model, onOpenNote, onRename, closeEditor });
  latest.current = { model, onOpenNote, onRename, closeEditor };
  const actions = useMemo<RowActions>(
    () => ({
      toggle(row, column) {
        const property = rowProperty(row, column.key);
        const checked = property?.value.type === "checkbox" && property.value.value;
        latest.current.model.writeCell(row.noteId, column, {
          kind: "value",
          value: { valueVersion: 1, type: "checkbox", value: !checked },
        });
      },
      rate(row, column, rating) {
        const property = rowProperty(row, column.key);
        const current = property?.value.type === "rating" ? property.value.value : null;
        latest.current.model.writeCell(row.noteId, column, {
          kind: "value",
          value: {
            valueVersion: 1,
            type: "rating",
            value: rating === 0 || rating === current ? null : rating,
          },
        });
      },
      open(noteId) {
        latest.current.onOpenNote(noteId);
      },
      rename(noteId, title) {
        if (title !== null) latest.current.onRename(noteId, title);
        latest.current.closeEditor(true);
      },
    }),
    [],
  );

  function moveTo(next: GridPosition): void {
    const row = next.row === 0 ? null : rows[next.row - 1];
    const column = visible[next.column];
    if (!column) return;
    setActive({ noteId: row?.noteId ?? null, columnKey: column.key, ...next });
    focusRequested.current = true;
    const element = scrollRef.current;
    if (!element || next.row === 0) return;
    const top = (next.row - 1) * ROW_PITCH;
    const bodyTop = element.scrollTop;
    const bodyHeight = element.clientHeight - HEADER_HEIGHT;
    let nextTop = bodyTop;
    if (top < bodyTop) nextTop = top;
    else if (top + ROW_PITCH > bodyTop + bodyHeight) nextTop = top + ROW_PITCH - bodyHeight;
    if (nextTop !== bodyTop) {
      element.scrollTop = nextTop;
      setScrollRow(Math.floor(nextTop / ROW_PITCH));
    }
  }

  function startEdit(rowIndex: number, columnIndex: number, initialText: string | null): void {
    const row = rows[rowIndex];
    const column = visible[columnIndex];
    if (!row || !column) return;
    if (column.kind === "built-in") {
      if (column.key === "title") setRenaming(row.noteId);
      return;
    }
    const display = cellDisplay(row, column, people);
    if (display.kind === "mismatch") {
      model.setNotice(
        `${column.name} is stored as ${display.storedType} in this note. Open the note to change it.`,
      );
      return;
    }
    if (column.type === "checkbox") {
      actions.toggle(row, column);
      return;
    }
    if (!isTextEditable(column) && !isPickerEditable(column)) return;
    const cell = cellFor(gridRef.current, rowIndex + 1, columnIndex);
    if (!cell) return;
    setEditing({
      noteId: row.noteId,
      columnKey: column.key,
      anchor: cell.getBoundingClientRect(),
      initialText,
    });
  }

  function clearCell(row: DatabaseRow, column: DatabaseColumn): void {
    if (column.kind !== "property" || rowProperty(row, column.key) === null) return;
    const display = cellDisplay(row, column, people);
    if (display.kind === "mismatch" || display.kind === "empty") return;
    model.writeCell(row.noteId, column, {
      kind: "value",
      value: emptyNotePropertyValue(column.type),
    });
  }

  function closeEditor(refocus: boolean): void {
    setEditing(null);
    setRenaming(null);
    if (refocus) focusRequested.current = true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    const cellPosition = parseCell(target);
    if (cellPosition === null) return;
    const pageRows = Math.max(1, Math.floor((viewportHeight - HEADER_HEIGHT) / ROW_PITCH) - 1);
    const next = nextGridPosition(event, cellPosition, rows.length + 1, visible.length, pageRows);
    if (next !== null) {
      event.preventDefault();
      moveTo(next);
      return;
    }
    const column = visible[cellPosition.column];
    if (!column) return;
    if (cellPosition.row === 0) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        model.updateView({ sorts: headerSorts(view.sorts, column.key) });
      }
      return;
    }
    const rowIndex = cellPosition.row - 1;
    const row = rows[rowIndex];
    if (!row) return;
    const mod = event.ctrlKey || event.metaKey || event.altKey;
    if (event.key === "Enter" && !mod) {
      event.preventDefault();
      if (column.key === "title") onOpenNote(row.noteId);
      else startEdit(rowIndex, cellPosition.column, null);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      startEdit(rowIndex, cellPosition.column, null);
      return;
    }
    if (column.kind !== "property") return;
    if (event.key === " " && column.type === "checkbox") {
      event.preventDefault();
      actions.toggle(row, column);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      clearCell(row, column);
      return;
    }
    const rating = column.type === "rating" ? ratingKey(event) : null;
    if (rating !== null) {
      event.preventDefault();
      actions.rate(row, column, rating);
      return;
    }
    if (!mod && event.key.length === 1 && event.key !== " " && isTextEditable(column)) {
      event.preventDefault();
      startEdit(rowIndex, cellPosition.column, column.type === "date" ? null : event.key);
    }
  }

  function onFocus(event: FocusEvent<HTMLDivElement>): void {
    const cellPosition = parseCell(event.target);
    if (cellPosition === null) return;
    const row = cellPosition.row === 0 ? null : rows[cellPosition.row - 1];
    const column = visible[cellPosition.column];
    if (!column) return;
    setActive((current) =>
      current.row === cellPosition.row &&
      current.column === cellPosition.column &&
      current.noteId === (row?.noteId ?? null)
        ? current
        : { noteId: row?.noteId ?? null, columnKey: column.key, ...cellPosition },
    );
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    const cell = (event.target as HTMLElement).closest("[data-cell]");
    pointerWasActive.current = cell !== null && cell === document.activeElement;
  }

  function onClick(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>("[data-cell]");
    const cellPosition = cell ? parseCell(cell) : null;
    if (!cell || cellPosition === null) return;
    const column = visible[cellPosition.column];
    if (!column) return;
    if (cellPosition.row === 0) {
      model.updateView({ sorts: headerSorts(view.sorts, column.key) });
      return;
    }
    const rowIndex = cellPosition.row - 1;
    const row = rows[rowIndex];
    if (!row || column.kind !== "property") return;
    const star = target.closest<HTMLElement>("[data-rating]");
    if (column.type === "rating" && star) {
      actions.rate(row, column, Number(star.dataset.rating));
      return;
    }
    if (column.type === "checkbox") {
      actions.toggle(row, column);
      return;
    }
    if (pointerWasActive.current) startEdit(rowIndex, cellPosition.column, null);
  }

  function onDoubleClick(event: MouseEvent<HTMLDivElement>): void {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    const cellPosition = cell ? parseCell(cell) : null;
    if (cellPosition === null || cellPosition.row === 0) return;
    const column = visible[cellPosition.column];
    if (column?.kind === "built-in" && column.key === "title") {
      startEdit(cellPosition.row - 1, cellPosition.column, null);
    }
  }

  const editingRow = editing ? rows[rowIndexById.get(editing.noteId) ?? -1] : undefined;
  const editingColumn = editing
    ? visible.find((column): column is PropertyColumn => column.key === editing.columnKey)
    : undefined;
  const editor =
    editing && editingRow && editingColumn?.kind === "property" ? (
      <CellEditor
        key={`${editing.noteId}:${editing.columnKey}`}
        column={editingColumn}
        row={editingRow}
        people={people}
        anchor={editing.anchor}
        initialText={editing.initialText}
        onCommit={(input) => model.writeCell(editing.noteId, editingColumn, input)}
        onClose={closeEditor}
      />
    ) : null;

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 overflow-auto scroll-pt-9 scroll-pl-[280px]"
      onScroll={(event) => {
        const nextRow = Math.floor(event.currentTarget.scrollTop / ROW_PITCH);
        if (nextRow !== scrollRow) setScrollRow(nextRow);
        if (editing && editingColumn && isPickerEditable(editingColumn)) closeEditor(false);
      }}
    >
      <div
        ref={gridRef}
        role="grid"
        aria-label={model.title}
        aria-rowcount={rows.length + 1}
        aria-colcount={visible.length}
        aria-describedby="database-keyboard-help"
        className="min-w-full text-[13px]"
        style={{ width: totalWidth }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div role="rowgroup" className="sticky top-0 z-[2] bg-theme-editor">
          <div
            role="row"
            aria-rowindex={1}
            className="flex border-b border-border"
            style={{ height: HEADER_HEIGHT }}
          >
            {visible.map((column, columnIndex) => {
              const sort = view.sorts.find((entry) => entry.column === column.key);
              const isActive = position.row === 0 && position.column === columnIndex;
              return (
                <div
                  key={column.key}
                  role="columnheader"
                  data-cell={`0:${columnIndex}`}
                  aria-colindex={columnIndex + 1}
                  aria-sort={
                    sort === undefined
                      ? undefined
                      : sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                  }
                  tabIndex={
                    isActive || (!activeRendered && columnIndex === position.column) ? 0 : -1
                  }
                  title={`Sort by ${column.name}`}
                  className={cn(
                    "flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border/60 px-2 text-[12px] font-medium text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
                    columnIndex === 0 && "sticky left-0 z-[1] bg-theme-editor",
                  )}
                  style={{ width: widths[columnIndex] }}
                >
                  <span className="shrink-0 opacity-70">{columnIcon(column)}</span>
                  <span className="min-w-0 truncate">{column.name}</span>
                  {sort &&
                    (sort.direction === "asc" ? (
                      <ArrowUpIcon size={11} className="ml-auto shrink-0" aria-hidden="true" />
                    ) : (
                      <ArrowDownIcon size={11} className="ml-auto shrink-0" aria-hidden="true" />
                    ))}
                </div>
              );
            })}
          </div>
        </div>
        <div role="rowgroup" className="relative" style={{ height: rows.length * ROW_PITCH }}>
          {rows.slice(range.start, range.end).map((row, offset) => {
            const rowIndex = range.start + offset;
            const isActiveRow = position.row === rowIndex + 1;
            return (
              <TableRow
                key={row.noteId}
                row={row}
                rowIndex={rowIndex}
                columns={visible}
                widths={widths}
                people={people}
                activeColumn={isActiveRow ? position.column : null}
                editingKey={editing?.noteId === row.noteId ? editing.columnKey : null}
                editor={editing?.noteId === row.noteId ? editor : null}
                renaming={renaming === row.noteId}
                actions={actions}
              />
            );
          })}
        </div>
      </div>
      <NewRow model={model} />
    </div>
  );
}

function resolvePosition(
  active: ActiveCell,
  rowCount: number,
  columns: readonly DatabaseColumn[],
  rowIndexById: ReadonlyMap<string, number>,
): GridPosition {
  const byKey = columns.findIndex((column) => column.key === active.columnKey);
  const column = byKey >= 0 ? byKey : Math.min(active.column, Math.max(0, columns.length - 1));
  if (active.noteId === null) return { row: 0, column };
  const index = rowIndexById.get(active.noteId);
  const row = index === undefined ? Math.min(active.row, rowCount) : index + 1;
  return { row, column };
}

type RowProps = {
  row: DatabaseRow;
  rowIndex: number;
  columns: readonly DatabaseColumn[];
  widths: readonly number[];
  people: ReadonlyMap<string, PersonRecord>;
  activeColumn: number | null;
  editingKey: string | null;
  editor: ReactNode;
  renaming: boolean;
  actions: RowActions;
};

const TableRow = memo(function TableRow({
  row,
  rowIndex,
  columns,
  widths,
  people,
  activeColumn,
  editingKey,
  editor,
  renaming,
  actions,
}: RowProps) {
  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      className="group/row absolute left-0 flex border-b border-border/50 hover:bg-[hsl(var(--foreground)/0.025)]"
      style={{ top: rowIndex * ROW_PITCH, height: ROW_PITCH, width: "100%" }}
    >
      {columns.map((column, columnIndex) => {
        const display = cellDisplay(row, column, people);
        const isTitle = column.key === "title";
        const label =
          display.kind === "checkbox" || display.kind === "rating" || display.kind === "mismatch"
            ? `${column.name}: ${displayText(display)}`
            : undefined;
        return (
          <div
            key={column.key}
            role={isTitle ? "rowheader" : "gridcell"}
            data-cell={`${rowIndex + 1}:${columnIndex}`}
            aria-colindex={columnIndex + 1}
            aria-readonly={column.kind === "built-in" && !isTitle ? true : undefined}
            aria-label={label}
            tabIndex={activeColumn === columnIndex ? 0 : -1}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 overflow-hidden border-r border-border/40 px-2 outline-none focus:shadow-[inset_0_0_0_2px_hsl(var(--foreground)/0.35)]",
              isTitle &&
                "sticky left-0 z-[1] bg-theme-editor font-medium text-foreground group-hover/row:bg-[image:linear-gradient(hsl(var(--foreground)/0.025),hsl(var(--foreground)/0.025))]",
              column.kind === "built-in" && !isTitle && "text-muted-foreground",
            )}
            style={{ width: widths[columnIndex] }}
          >
            {isTitle && renaming ? (
              <RenameInput
                title={row.title}
                onDone={(title) => actions.rename(row.noteId, title)}
              />
            ) : (
              <CellContent display={display} locked={isTitle && row.locked} />
            )}
            {isTitle && !renaming && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                title="Open note"
                className="ml-auto hidden size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground group-hover/row:flex"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.open(row.noteId);
                }}
              >
                <ExternalLinkIcon size={12} />
              </button>
            )}
            {editingKey === column.key && editor}
          </div>
        );
      })}
    </div>
  );
});

function CellContent({ display, locked }: { display: CellDisplay; locked: boolean }) {
  switch (display.kind) {
    case "empty":
      return null;
    case "text":
      return (
        <span
          className={cn(
            "min-w-0 truncate",
            display.numeric && "ml-auto tabular-nums",
            locked && "text-muted-foreground",
          )}
        >
          {display.text}
        </span>
      );
    case "mismatch":
      return (
        <span className="min-w-0 truncate italic text-muted-foreground/70">{display.text}</span>
      );
    case "options":
      return (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
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
      return (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-muted-foreground/60",
            display.checked && "border-foreground/70 bg-foreground/80 text-theme-editor",
          )}
        >
          {display.checked && (
            <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor">
              <path d="M2.5 6.2l2.3 2.3 4.7-5" strokeWidth="1.6" />
            </svg>
          )}
        </span>
      );
    case "rating":
      return <Stars value={display.value} />;
  }
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="flex items-center">
      {[1, 2, 3, 4, 5].map((rating) => (
        <span
          key={rating}
          data-rating={rating}
          className={cn(
            "cursor-pointer px-px text-[13px] leading-none",
            rating <= value ? "text-foreground" : "text-muted-foreground/35",
          )}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function RenameInput({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  function finish(title: string | null): void {
    if (settled.current) return;
    settled.current = true;
    onDone(title);
  }

  return (
    <input
      ref={inputRef}
      aria-label="Note name"
      defaultValue={title}
      className="absolute inset-0 z-10 h-full w-full border border-foreground/30 bg-popover px-2 text-[13px] font-medium text-foreground outline-none"
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(event.currentTarget.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      }}
    />
  );
}

/**
 * Adds notes from the bottom of the table. The field stays open after Enter
 * so several notes can be typed in a row; Escape or an empty blur closes it.
 */
function NewRow({ model }: { model: DatabaseModel }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = model.status !== "ready";

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  function close(refocus: boolean): void {
    setOpen(false);
    setDraft("");
    if (refocus) window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  if (open) {
    return (
      <form
        className="sticky left-0 flex h-9 w-[min(100%,480px)] items-center gap-2 px-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (model.createNote(draft) !== null) setDraft("");
        }}
      >
        <PlusIcon size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoComplete="off"
          aria-label="New note name"
          placeholder="Name the note, then press Enter"
          value={draft}
          ref={inputRef}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.trim() === "") close(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/55"
        />
      </form>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      className="sticky left-0 flex h-9 cursor-pointer items-center gap-2 px-2 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-40"
      onClick={() => setOpen(true)}
    >
      <PlusIcon size={12} aria-hidden="true" />
      New note
    </button>
  );
}
