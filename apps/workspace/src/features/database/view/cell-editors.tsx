import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { NotePropertyValue } from "@skriuw/renderer-core/contracts/workspace";
import {
  foldOptionLabel,
  rowProperty,
  type DatabaseOption,
  type PropertyColumn,
} from "@skriuw/renderer-core/database/columns";
import type { DatabaseRow } from "@skriuw/renderer-core/database/rows";
import type { CellInput } from "@skriuw/renderer-core/database/writes";
import type { NotePropertyType } from "@skriuw/renderer-core/properties/types";
import type { PersonRecord } from "@skriuw/renderer-core/references/types";
import { parseOptionalNumber } from "@/features/note-chrome/property-editing";
import { CheckIcon, PlusIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { OptionPill } from "./option-pill";

type EditorProps = {
  column: PropertyColumn;
  row: DatabaseRow;
  people: ReadonlyMap<string, PersonRecord>;
  anchor: DOMRect;
  initialText: string | null;
  onCommit: (input: CellInput) => void;
  onClose: (refocus: boolean) => void;
};

type PickerItem =
  | { kind: "option"; key: string; label: string; option: DatabaseOption | null }
  | { kind: "create"; key: string; label: string; option: null };

const PICKER_WIDTH = 240;
const VIEWPORT_MARGIN = 8;

const TEXT_TYPES: ReadonlySet<NotePropertyType> = new Set([
  "text",
  "url",
  "location",
  "email",
  "phone",
  "number",
  "date",
]);

/** Whether a column edits through a text field, so typing on the cell starts editing. */
export function isTextEditable(column: PropertyColumn): boolean {
  return TEXT_TYPES.has(column.type);
}

/** Whether a column edits through a picker anchored below the cell. */
export function isPickerEditable(column: PropertyColumn): boolean {
  return column.type === "select" || column.type === "multi-select" || column.type === "person";
}

export function CellEditor(props: EditorProps) {
  if (isTextEditable(props.column)) return <TextCellEditor {...props} />;
  if (props.column.type === "person") return <PersonPicker {...props} />;
  if (isPickerEditable(props.column)) return <OptionPicker {...props} />;
  return null;
}

function currentText(row: DatabaseRow, column: PropertyColumn): string {
  const value = rowProperty(row, column.key)?.value;
  if (value === undefined || value.type !== column.type) return "";
  if (value.type === "number") return value.value === null ? "" : String(value.value);
  return typeof value.value === "string" ? value.value : "";
}

function textValue(type: NotePropertyType, text: string): NotePropertyValue | null {
  const trimmed = text.trim();
  switch (type) {
    case "text":
    case "url":
    case "location":
    case "email":
    case "phone":
    case "date":
      return { valueVersion: 1, type, value: trimmed };
    case "number": {
      const parsed = parseOptionalNumber(trimmed);
      return parsed === undefined ? null : { valueVersion: 1, type, value: parsed };
    }
    default:
      return null;
  }
}

function inputType(type: NotePropertyType): string {
  switch (type) {
    case "date":
      return "date";
    case "url":
      return "url";
    case "email":
      return "email";
    case "phone":
      return "tel";
    default:
      return "text";
  }
}

/**
 * Edits a text, number or date cell in place. Enter and blur save, Escape
 * discards, and an invalid number stays open with the field marked.
 */
function TextCellEditor({ column, row, initialText, onCommit, onClose }: EditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const [draft, setDraft] = useState(() => initialText ?? currentText(row, column));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    if (initialText === null && input.type !== "date") input.select();
  }, [initialText]);

  function finish(save: boolean, refocus: boolean): void {
    if (settled.current) return;
    if (save) {
      const value = textValue(column.type, draft);
      if (value === null) {
        setInvalid(true);
        return;
      }
      settled.current = true;
      if (draft.trim() !== currentText(row, column)) onCommit({ kind: "value", value });
    } else {
      settled.current = true;
    }
    onClose(refocus);
  }

  return (
    <input
      ref={inputRef}
      type={inputType(column.type)}
      inputMode={column.type === "number" ? "decimal" : undefined}
      aria-label={`${column.name} for ${row.title || "Untitled"}`}
      aria-invalid={invalid}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
      }}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false, true);
        } else if (event.key === "Tab") {
          finish(true, false);
        }
      }}
      className={cn(
        "absolute inset-0 z-10 h-full w-full min-w-0 border border-foreground/30 bg-popover px-2 text-[13px] text-foreground outline-none",
        column.type === "number" && "text-right tabular-nums",
        invalid && "border-destructive text-destructive",
      )}
    />
  );
}

function selectedLabels(row: DatabaseRow, column: PropertyColumn): string[] {
  const property = rowProperty(row, column.key);
  if (property === null || property.value.type !== column.type) return [];
  const value = property.value;
  if (value.type !== "select" && value.type !== "multi-select") return [];
  const ids = value.type === "select" ? (value.value === null ? [] : [value.value]) : value.value;
  return ids.flatMap((id) => {
    const option = property.options.find((entry) => entry.id === id);
    return option ? [option.label] : [];
  });
}

function selectedPeople(row: DatabaseRow, column: PropertyColumn): string[] {
  const value = rowProperty(row, column.key)?.value;
  return value?.type === "person" ? value.value : [];
}

/** Keeps a picker inside the viewport, opening above the cell when there is no room below. */
function usePickerPosition(anchor: DOMRect) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchor.left, window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN),
    ),
    top: anchor.bottom + 4,
  }));

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const height = panel.offsetHeight;
    const below = window.innerHeight - anchor.bottom - VIEWPORT_MARGIN;
    if (height > below && anchor.top - VIEWPORT_MARGIN > below) {
      setPosition((current) => ({
        ...current,
        top: Math.max(VIEWPORT_MARGIN, anchor.top - height - 4),
      }));
    }
  }, [anchor]);

  return { panelRef, position };
}

function useOutsidePointer(panelRef: RefObject<HTMLElement | null>, onOutside: () => void) {
  const latest = useRef(onOutside);
  latest.current = onOutside;
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) latest.current();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [panelRef]);
}

type PickerProps = {
  label: string;
  anchor: DOMRect;
  items: readonly PickerItem[];
  selected: ReadonlySet<string>;
  multiple: boolean;
  query: string;
  placeholder: string;
  emptyLabel: string;
  onQuery: (query: string) => void;
  onChoose: (item: PickerItem) => void;
  onClose: (refocus: boolean) => void;
};

/**
 * A searchable listbox below a cell. Arrow keys move through the matches,
 * Enter picks the highlighted one (or creates the typed option), and Escape
 * or Tab close it. Multi-value pickers stay open between picks.
 */
function Picker({
  label,
  anchor,
  items,
  selected,
  multiple,
  query,
  placeholder,
  emptyLabel,
  onQuery,
  onChoose,
  onClose,
}: PickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { panelRef, position } = usePickerPosition(anchor);
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));
  useOutsidePointer(panelRef, () => onClose(false));

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, panelRef]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    event.stopPropagation();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) onChoose(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      onClose(true);
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={{ left: position.left, top: position.top, width: PICKER_WIDTH }}
      className="fixed z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={items.length > 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={label}
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          onQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full border-b border-border bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/55"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        className="max-h-64 overflow-y-auto p-1"
      >
        {items.length === 0 && (
          <li className="px-2 py-1.5 text-[12px] text-muted-foreground">{emptyLabel}</li>
        )}
        {items.map((item, index) => {
          const isSelected = item.kind === "option" && selected.has(item.key);
          return (
            <li
              key={`${item.kind}:${item.key}`}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={isSelected}
              className={cn(
                "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground",
                index === activeIndex && "bg-accent text-foreground",
              )}
              onPointerMove={() => setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onChoose(item)}
            >
              {item.kind === "create" ? (
                <>
                  <PlusIcon size={12} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    Create <span className="text-foreground">{item.label}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {isSelected && <CheckIcon size={12} aria-hidden="true" />}
                  </span>
                  {item.option ? (
                    <OptionPill label={item.label} color={item.option.color} />
                  ) : (
                    <span className="min-w-0 truncate text-foreground">{item.label}</span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}

/**
 * Picks select and multi-select options by label. Options come from every
 * note in the view, so a label another note uses can be added here even when
 * this note has never seen it.
 */
function OptionPicker({ column, row, anchor, onCommit, onClose }: EditorProps) {
  const [query, setQuery] = useState("");
  const labels = selectedLabels(row, column);
  const selected = new Set(labels.map(foldOptionLabel));
  const needle = foldOptionLabel(query);
  const items: PickerItem[] = column.options
    .filter((option) => needle.length === 0 || option.key.includes(needle))
    .map((option) => ({ kind: "option", key: option.key, label: option.label, option }));
  for (const label of labels) {
    const key = foldOptionLabel(label);
    if (!items.some((item) => item.key === key) && (needle.length === 0 || key.includes(needle))) {
      items.push({ kind: "option", key, label, option: null });
    }
  }
  if (needle.length > 0 && !items.some((item) => item.key === needle)) {
    items.push({ kind: "create", key: needle, label: query.trim(), option: null });
  }
  const multiple = column.type === "multi-select";

  function choose(item: PickerItem): void {
    const has = selected.has(item.key);
    if (!multiple) {
      onCommit({ kind: "labels", labels: has ? [] : [item.label] });
      onClose(true);
      return;
    }
    const next = has
      ? labels.filter((label) => foldOptionLabel(label) !== item.key)
      : [...labels, item.label];
    onCommit({ kind: "labels", labels: next });
    setQuery("");
  }

  return (
    <Picker
      label={`${column.name} for ${row.title || "Untitled"}`}
      anchor={anchor}
      items={items}
      selected={selected}
      multiple={multiple}
      query={query}
      placeholder="Search or create an option"
      emptyLabel="Type to create an option"
      onQuery={setQuery}
      onChoose={choose}
      onClose={onClose}
    />
  );
}

function PersonPicker({ column, row, people, anchor, onCommit, onClose }: EditorProps) {
  const [query, setQuery] = useState("");
  const ids = selectedPeople(row, column);
  const selected = new Set(ids);
  const needle = foldOptionLabel(query);
  const items: PickerItem[] = [...people.values()]
    .filter((person) => needle.length === 0 || foldOptionLabel(person.name).includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((person) => ({ kind: "option", key: person.id, label: person.name, option: null }));

  function choose(item: PickerItem): void {
    const next = selected.has(item.key) ? ids.filter((id) => id !== item.key) : [...ids, item.key];
    onCommit({ kind: "value", value: { valueVersion: 1, type: "person", value: next } });
    setQuery("");
  }

  return (
    <Picker
      label={`${column.name} for ${row.title || "Untitled"}`}
      anchor={anchor}
      items={items}
      selected={selected}
      multiple
      query={query}
      placeholder="Search people"
      emptyLabel={people.size === 0 ? "No people in this workspace" : "No matches"}
      onQuery={setQuery}
      onChoose={choose}
      onClose={onClose}
    />
  );
}
