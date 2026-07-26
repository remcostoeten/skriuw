import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { commitOperations } from "../actions/workspace";
import type {
  NoteProperty,
  NotePropertyColor,
  NotePropertyOption,
  NotePropertyTemplate,
  NotePropertyValue,
  WorkspaceOperation,
} from "../contracts/workspace";
import type { PersonRecord } from "../references/types";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CloseIcon,
  Trash2Icon,
} from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import {
  changeNotePropertyType,
  createPropertyOption,
  removePropertyOption,
  reorderPropertyOptions,
  upsertPropertyOption,
} from "./operations";
import {
  addPropertyOperations,
  applyTemplateOperations,
  createBrowserPropertyIdFactory,
  deletePropertyOperations,
  parseOptionalNumber,
  PROPERTY_COLOR_LABELS,
  PROPERTY_TYPE_LABELS,
  propertyErrorMessage,
  reorderPropertyOperations,
  replaceStringValue,
  updatePropertyOperations,
} from "./property-editor-model";
import { BUILT_IN_PROPERTY_TEMPLATES } from "./templates";
import { NOTE_PROPERTY_COLORS, NOTE_PROPERTY_TYPES } from "./types";

type Props = {
  store: RendererStore;
};

type Commit = (operations: WorkspaceOperation[]) => void;

const EMPTY_PROPERTIES: readonly NoteProperty[] = [];
const EMPTY_TEMPLATES: readonly NotePropertyTemplate[] = [];
const inputClass =
  "min-h-7 w-full min-w-0 rounded-[var(--radius)] border border-transparent bg-transparent px-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/55 hover:border-border focus:border-ring/45 focus:bg-background disabled:cursor-not-allowed disabled:opacity-45";
const compactButtonClass =
  "inline-flex min-h-7 items-center justify-center gap-1 rounded-[var(--radius)] border border-border bg-transparent px-2 text-[11px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-40";
const iconButtonClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-30";

function selectActiveProperties(state: RendererState): readonly NoteProperty[] {
  if (state.activeNoteId === null) return EMPTY_PROPERTIES;
  return state.propertiesByNoteId.get(state.activeNoteId) ?? EMPTY_PROPERTIES;
}

function selectTemplates(state: RendererState): readonly NotePropertyTemplate[] {
  return state.propertyTemplates ?? EMPTY_TEMPLATES;
}

function selectPeople(state: RendererState): ReadonlyMap<string, PersonRecord> {
  return state.people;
}

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

export function NotePropertiesPanel({ store }: Props) {
  const noteId = useRendererSelector(store, selectActiveNoteId);
  const properties = useRendererSelector(store, selectActiveProperties);
  const customTemplates = useRendererSelector(store, selectTemplates);
  const people = useRendererSelector(store, selectPeople);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<NotePropertyValue["type"]>("text");
  const [templateId, setTemplateId] = useState("");
  const [armedTemplateId, setArmedTemplateId] = useState<string | null>(null);
  const idFactory = useMemo(createBrowserPropertyIdFactory, []);
  const templates = useMemo(
    () => [...BUILT_IN_PROPERTY_TEMPLATES, ...customTemplates],
    [customTemplates],
  );

  function commit(operations: WorkspaceOperation[]): void {
    if (operations.length === 0) return;
    setError(null);
    setPending((count) => count + 1);
    void commitOperations(store, operations)
      .catch((reason: unknown) => setError(propertyErrorMessage(reason)))
      .finally(() => setPending((count) => Math.max(0, count - 1)));
  }

  if (noteId === null) {
    return (
      <div className="py-2 text-[12px] text-muted-foreground">
        Select a note to edit its properties.
      </div>
    );
  }

  function addProperty(): void {
    commit(addPropertyOperations(noteId!, properties, addType, addName, Date.now(), idFactory));
    setAddName("");
    setAddOpen(false);
  }

  function prepareTemplate(): void {
    if (!templateId) return;
    if (properties.length === 0) {
      applyTemplate(templateId);
      return;
    }
    setArmedTemplateId(templateId);
  }

  function applyTemplate(id: string): void {
    const template = templates.find((entry) => entry.id === id);
    if (!template) {
      setError("The selected template is no longer available.");
      return;
    }
    commit(applyTemplateOperations(noteId!, properties, template, Date.now(), idFactory));
    setArmedTemplateId(null);
    setTemplateId("");
  }

  return (
    <div aria-busy={pending > 0} className="space-y-2">
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 border-l-2 border-destructive bg-destructive/[0.07] px-2 py-1.5 text-[11px] leading-4 text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss property error"
            onClick={() => setError(null)}
            className="shrink-0 rounded-[var(--radius)] p-0.5 hover:bg-destructive/10 focus-visible:ring-1 focus-visible:ring-destructive/50"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {properties.length === 0 ? (
        <div className="border-y border-dashed border-border py-3 text-center">
          <p className="text-[12px] font-medium text-foreground/75">No properties</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Add a typed field or apply a template.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {properties.map((property, index) => (
            <PropertyRow
              key={property.id}
              property={property}
              people={people}
              first={index === 0}
              last={index === properties.length - 1}
              onCommit={commit}
              onReorder={(offset) =>
                commit(reorderPropertyOperations(properties, property.id, offset, Date.now()))
              }
              idFactory={idFactory}
            />
          ))}
        </div>
      )}

      <div className="border-t border-border pt-2">
        {addOpen ? (
          <form
            aria-label="Add property"
            className="grid grid-cols-[minmax(0,1fr)_7rem] gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              addProperty();
            }}
          >
            <input
              autoFocus
              aria-label="New property name"
              name="new-property-name"
              value={addName}
              placeholder={PROPERTY_TYPE_LABELS[addType]}
              onChange={(event) => setAddName(event.target.value)}
              className={cn(inputClass, "border-border")}
            />
            <select
              aria-label="New property type"
              name="new-property-type"
              value={addType}
              onChange={(event) => setAddType(event.target.value as NotePropertyValue["type"])}
              className={cn(inputClass, "border-border")}
            >
              {NOTE_PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROPERTY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <div className="col-span-2 flex justify-end gap-1.5">
              <button type="button" className={compactButtonClass} onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={compactButtonClass}>
                Add property
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className={compactButtonClass} onClick={() => setAddOpen(true)}>
            + Add property
          </button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-border pt-2">
        <select
          aria-label="Property template"
          name="property-template"
          value={templateId}
          onChange={(event) => {
            setTemplateId(event.target.value);
            setArmedTemplateId(null);
          }}
          className={cn(inputClass, "border-border")}
        >
          <option value="">Choose template…</option>
          <optgroup label="Built in">
            {BUILT_IN_PROPERTY_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </optgroup>
          {customTemplates.length > 0 && (
            <optgroup label="Workspace">
              {customTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          disabled={!templateId}
          className={compactButtonClass}
          onClick={prepareTemplate}
        >
          Apply
        </button>
        {armedTemplateId && (
          <div
            role="group"
            aria-label="Confirm template application"
            className="col-span-2 flex items-center justify-between gap-2 bg-muted/45 px-2 py-1.5"
          >
            <span className="text-[11px] text-muted-foreground">
              Replace {properties.length} existing {properties.length === 1 ? "property" : "properties"}?
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className={compactButtonClass}
                onClick={() => setArmedTemplateId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(compactButtonClass, "border-destructive/40 text-destructive")}
                onClick={() => applyTemplate(armedTemplateId)}
              >
                Replace
              </button>
            </span>
          </div>
        )}
      </div>
      {pending > 0 && (
        <p role="status" className="text-[10px] text-muted-foreground">
          Saving {pending === 1 ? "change" : `${pending} changes`}…
        </p>
      )}
    </div>
  );
}

type RowProps = {
  property: NoteProperty;
  people: ReadonlyMap<string, PersonRecord>;
  first: boolean;
  last: boolean;
  onCommit: Commit;
  onReorder: (offset: -1 | 1) => void;
  idFactory: ReturnType<typeof createBrowserPropertyIdFactory>;
};

function PropertyRow({
  property,
  people,
  first,
  last,
  onCommit,
  onReorder,
  idFactory,
}: RowProps) {
  const [armed, setArmed] = useState(false);

  function update(next: NoteProperty): void {
    onCommit(updatePropertyOperations(next, Date.now()));
  }

  function handleKeyboardReorder(event: KeyboardEvent<HTMLDivElement>): void {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    onReorder(event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <div
      className="group py-2"
      data-property-id={property.id}
      onKeyDown={handleKeyboardReorder}
    >
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-1">
        <select
          aria-label={`${property.name} type`}
          name={`property-${property.id}-type`}
          value={property.value.type}
          onChange={(event) =>
            update(
              changeNotePropertyType(
                property,
                event.target.value as NotePropertyValue["type"],
              ),
            )
          }
          className={cn(inputClass, "w-[5.5rem] text-[11px] text-muted-foreground")}
          title={`Type: ${PROPERTY_TYPE_LABELS[property.value.type]}`}
        >
          {NOTE_PROPERTY_TYPES.map((type) => (
            <option key={type} value={type}>
              {PROPERTY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <PropertyName property={property} onUpdate={update} />
        <button
          type="button"
          aria-label={`Delete ${property.name}`}
          aria-expanded={armed}
          className={iconButtonClass}
          onClick={() => setArmed(true)}
        >
          <Trash2Icon size={12} />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
        <ValueEditor property={property} people={people} onUpdate={update} />
        <div className="flex">
          <button
            type="button"
            aria-label={`Move ${property.name} up`}
            disabled={first}
            title="Move up (Alt+ArrowUp)"
            className={iconButtonClass}
            onClick={() => onReorder(-1)}
          >
            <ArrowUpIcon size={12} />
          </button>
          <button
            type="button"
            aria-label={`Move ${property.name} down`}
            disabled={last}
            title="Move down (Alt+ArrowDown)"
            className={iconButtonClass}
            onClick={() => onReorder(1)}
          >
            <ArrowDownIcon size={12} />
          </button>
        </div>
      </div>
      {armed && (
        <div
          role="group"
          aria-label={`Confirm deletion of ${property.name}`}
          className="mt-1 flex items-center justify-end gap-1.5 bg-destructive/[0.06] px-1.5 py-1"
          onKeyDown={(event) => {
            if (event.key === "Escape") setArmed(false);
          }}
        >
          <span className="mr-auto text-[11px] text-muted-foreground">Delete this property?</span>
          <button type="button" className={compactButtonClass} onClick={() => setArmed(false)}>
            Cancel
          </button>
          <button
            autoFocus
            type="button"
            className={cn(compactButtonClass, "border-destructive/40 text-destructive")}
            onClick={() => onCommit(deletePropertyOperations(property, Date.now()))}
          >
            Delete
          </button>
        </div>
      )}
      {(property.value.type === "select" || property.value.type === "multi-select") && (
        <OptionEditor property={property} onUpdate={update} idFactory={idFactory} />
      )}
    </div>
  );
}

function PropertyName({
  property,
  onUpdate,
}: {
  property: NoteProperty;
  onUpdate: (property: NoteProperty) => void;
}) {
  const [draft, setDraft] = useState(property.name);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(property.name);
    setInvalid(false);
  }, [property.name]);

  function save(): void {
    const name = draft.trim();
    if (!name) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (name !== property.name) onUpdate({ ...property, name });
  }

  return (
    <input
      aria-label="Property name"
      name={`property-${property.id}-name`}
      aria-invalid={invalid}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(property.name);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      className={cn(inputClass, invalid && "border-destructive")}
    />
  );
}

function ValueEditor({
  property,
  people,
  onUpdate,
}: {
  property: NoteProperty;
  people: ReadonlyMap<string, PersonRecord>;
  onUpdate: (property: NoteProperty) => void;
}) {
  const value = property.value;

  if (value.type === "number") {
    return <NumberEditor property={property} value={value} onUpdate={onUpdate} />;
  }
  if (value.type === "checkbox") {
    return (
      <label className="flex min-h-7 items-center gap-2 px-1.5 text-[12px] text-muted-foreground">
        <input
          type="checkbox"
          name={`property-${property.id}-value`}
          checked={value.value}
          onChange={(event) =>
            onUpdate({ ...property, value: { ...value, value: event.target.checked } })
          }
        />
        {value.value ? "Checked" : "Unchecked"}
      </label>
    );
  }
  if (value.type === "rating") {
    return (
      <div role="group" aria-label={`${property.name} rating`} className="flex min-h-7 items-center">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            aria-label={`${rating} of 5`}
            aria-pressed={(value.value ?? 0) >= rating}
            className="size-6 rounded-[var(--radius)] text-[15px] text-muted-foreground outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring/55 aria-pressed:text-amber-500"
            onClick={() =>
              onUpdate({
                ...property,
                value: { ...value, value: value.value === rating ? null : rating },
              })
            }
          >
            ★
          </button>
        ))}
      </div>
    );
  }
  if (value.type === "select") {
    return (
      <select
        aria-label={`${property.name} value`}
        name={`property-${property.id}-value`}
        value={value.value ?? ""}
        onChange={(event) =>
          onUpdate({
            ...property,
            value: { ...value, value: event.target.value || null },
          })
        }
        className={inputClass}
      >
        <option value="">Empty</option>
        {property.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (value.type === "multi-select") {
    return (
      <MultiValueEditor
        label={property.name}
        choices={property.options.map(({ id, label }) => ({ id, label }))}
        selected={value.value}
        fieldName={`property-${property.id}-value`}
        onChange={(selected) => onUpdate({ ...property, value: { ...value, value: selected } })}
      />
    );
  }
  if (value.type === "person") {
    return (
      <MultiValueEditor
        label={property.name}
        choices={[...people.values()]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(({ id, name }) => ({ id, label: name }))}
        selected={value.value}
        fieldName={`property-${property.id}-value`}
        emptyLabel="No people in this workspace"
        onChange={(selected) => onUpdate({ ...property, value: { ...value, value: selected } })}
      />
    );
  }

  const inputType =
    value.type === "date"
      ? "date"
      : value.type === "email"
        ? "email"
        : value.type === "phone"
          ? "tel"
          : value.type === "url"
            ? "url"
            : "text";
  return (
    <StringValueEditor
      property={property}
      value={value}
      inputType={inputType}
      onUpdate={onUpdate}
    />
  );
}

function StringValueEditor({
  property,
  value,
  inputType,
  onUpdate,
}: {
  property: NoteProperty;
  value: Extract<
    NotePropertyValue,
    { type: "text" | "date" | "url" | "location" | "email" | "phone" }
  >;
  inputType: string;
  onUpdate: (property: NoteProperty) => void;
}) {
  const [draft, setDraft] = useState(value.value);

  useEffect(() => setDraft(value.value), [value.value]);

  function save(): void {
    if (draft !== value.value) {
      onUpdate({ ...property, value: replaceStringValue(value, draft) });
    }
  }

  return (
    <input
      type={inputType}
      aria-label={`${property.name} value`}
      name={`property-${property.id}-value`}
      value={draft}
      placeholder="Empty"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value.value);
          event.currentTarget.blur();
        }
      }}
      className={inputClass}
    />
  );
}

function NumberEditor({
  property,
  value,
  onUpdate,
}: {
  property: NoteProperty;
  value: Extract<NotePropertyValue, { type: "number" }>;
  onUpdate: (property: NoteProperty) => void;
}) {
  const [draft, setDraft] = useState(value.value?.toString() ?? "");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value.value?.toString() ?? "");
    setInvalid(false);
  }, [value.value]);

  function save(): void {
    const parsed = parseOptionalNumber(draft);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed !== value.value) {
      onUpdate({ ...property, value: { ...value, value: parsed } });
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${property.name} value`}
      name={`property-${property.id}-value`}
      aria-invalid={invalid}
      value={draft}
      placeholder="Empty"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cn(inputClass, invalid && "border-destructive")}
    />
  );
}

function MultiValueEditor({
  label,
  choices,
  selected,
  fieldName,
  onChange,
  emptyLabel = "No options yet",
}: {
  label: string;
  choices: readonly { id: string; label: string }[];
  selected: readonly string[];
  fieldName: string;
  onChange: (selected: string[]) => void;
  emptyLabel?: string;
}) {
  const selectedSet = new Set(selected);
  return (
    <details className="relative min-w-0">
      <summary className={cn(inputClass, "flex cursor-pointer list-none items-center justify-between")}>
        <span className="truncate">
          {selected.length === 0 ? "Empty" : `${selected.length} selected`}
        </span>
        <ChevronDownIcon size={12} />
      </summary>
      <fieldset
        aria-label={`${label} choices`}
        className="mt-1 max-h-40 space-y-0.5 overflow-y-auto border border-border bg-background p-1"
      >
        {choices.length === 0 ? (
          <p className="px-1.5 py-1 text-[11px] text-muted-foreground">{emptyLabel}</p>
        ) : (
          choices.map((choice) => (
            <label
              key={choice.id}
              className="flex min-h-7 cursor-pointer items-center gap-2 rounded-[var(--radius)] px-1.5 text-[12px] hover:bg-muted"
            >
              <input
                type="checkbox"
                name={fieldName}
                checked={selectedSet.has(choice.id)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(choice.id)) next.delete(choice.id);
                  else next.add(choice.id);
                  onChange([...next]);
                }}
              />
              <span className="truncate">{choice.label}</span>
            </label>
          ))
        )}
      </fieldset>
    </details>
  );
}

function OptionEditor({
  property,
  onUpdate,
  idFactory,
}: {
  property: NoteProperty;
  onUpdate: (property: NoteProperty) => void;
  idFactory: ReturnType<typeof createBrowserPropertyIdFactory>;
}) {
  const [label, setLabel] = useState("");

  function addOption(): void {
    const nextLabel = label.trim();
    if (!nextLabel) return;
    const color = NOTE_PROPERTY_COLORS[property.options.length % NOTE_PROPERTY_COLORS.length] ?? "gray";
    onUpdate(createPropertyOption(property, nextLabel, color, idFactory));
    setLabel("");
  }

  return (
    <details className="mt-1 pl-7">
      <summary className="cursor-pointer select-none text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
        Options ({property.options.length})
      </summary>
      <div className="mt-1 space-y-1 border-l border-border pl-2">
        {property.options.map((option, index) => (
          <OptionRow
            key={option.id}
            option={option}
            first={index === 0}
            last={index === property.options.length - 1}
            onChange={(next) => onUpdate(upsertPropertyOption(property, next))}
            onDelete={() => onUpdate(removePropertyOption(property, option.id))}
            onMove={(offset) => {
              const nextIndex = index + offset;
              const ids = property.options.map(({ id }) => id);
              const currentId = ids[index];
              const nextId = ids[nextIndex];
              if (!currentId || !nextId) return;
              ids[index] = nextId;
              ids[nextIndex] = currentId;
              onUpdate(reorderPropertyOptions(property, ids));
            }}
          />
        ))}
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            addOption();
          }}
        >
          <input
            aria-label={`New option for ${property.name}`}
            name={`property-${property.id}-new-option`}
            value={label}
            placeholder="New option"
            onChange={(event) => setLabel(event.target.value)}
            className={inputClass}
          />
          <button type="submit" disabled={!label.trim()} className={compactButtonClass}>
            Add
          </button>
        </form>
      </div>
    </details>
  );
}

function OptionRow({
  option,
  first,
  last,
  onChange,
  onDelete,
  onMove,
}: {
  option: NotePropertyOption;
  first: boolean;
  last: boolean;
  onChange: (option: NotePropertyOption) => void;
  onDelete: () => void;
  onMove: (offset: -1 | 1) => void;
}) {
  const [label, setLabel] = useState(option.label);

  useEffect(() => setLabel(option.label), [option.label]);

  return (
    <div className="space-y-1 border-b border-border/50 pb-1 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
        <input
          aria-label={`${option.label} option name`}
          name={`property-option-${option.id}-name`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            const next = label.trim();
            if (next) onChange({ ...option, label: next });
            else setLabel(option.label);
          }}
          className={inputClass}
        />
        <button
          type="button"
          aria-label={`Delete ${option.label} option`}
          onClick={onDelete}
          className={cn(iconButtonClass, "size-7")}
        >
          <Trash2Icon size={11} />
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
        <select
          aria-label={`${option.label} color`}
          name={`property-option-${option.id}-color`}
          value={option.color}
          onChange={(event) =>
            onChange({ ...option, color: event.target.value as NotePropertyColor })
          }
          className={inputClass}
        >
          {NOTE_PROPERTY_COLORS.map((color) => (
            <option key={color} value={color}>
              {PROPERTY_COLOR_LABELS[color]}
            </option>
          ))}
        </select>
        <span className="flex">
          <button
            type="button"
            disabled={first}
            aria-label={`Move ${option.label} option up`}
            onClick={() => onMove(-1)}
            className={cn(iconButtonClass, "size-6")}
          >
            <ArrowUpIcon size={11} />
          </button>
          <button
            type="button"
            disabled={last}
            aria-label={`Move ${option.label} option down`}
            onClick={() => onMove(1)}
            className={cn(iconButtonClass, "size-6")}
          >
            <ArrowDownIcon size={11} />
          </button>
        </span>
      </div>
    </div>
  );
}
