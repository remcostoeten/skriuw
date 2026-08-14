import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { commitOperations } from "@/store/actions/workspace";
import type {
  NoteProperty,
  NotePropertyColor,
  NotePropertyOption,
  NotePropertyTemplate,
  NotePropertyValue,
  WorkspaceOperation,
} from "@/contracts/workspace";
import type { PersonRecord } from "@/features/references/types";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  LayoutDashboardIcon,
  PlusIcon,
  Trash2Icon,
} from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { DateValueEditor } from "./date-value-editor";
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
import { PropertyPopover } from "./property-popover";
import { BUILT_IN_PROPERTY_TEMPLATES } from "./templates";
import { TYPE_ICON } from "./type-icons";
import { NOTE_PROPERTY_COLORS, NOTE_PROPERTY_TYPES } from "./types";

type Props = {
  store: RendererStore;
  selectNoteId?: (state: RendererState) => string | null;
};

type Commit = (operations: WorkspaceOperation[]) => void;
type IdFactory = ReturnType<typeof createBrowserPropertyIdFactory>;

const EMPTY_PROPERTIES: readonly NoteProperty[] = [];
const EMPTY_TEMPLATES: readonly NotePropertyTemplate[] = [];
const inputClass =
  "min-h-7 w-full min-w-0 rounded-md bg-transparent px-1 py-0.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus-visible:bg-accent/70 focus-visible:ring-1 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-45";
const nameInputClass =
  "w-full min-w-0 rounded-md bg-transparent px-1 py-0.5 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-accent/70 focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/45";
const ghostButtonClass =
  "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50";
const menuItemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50";
const menuHeadingClass = cn("px-2 pb-1 pt-1", sectionLabelClass);
const typeIconButtonClass =
  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:bg-accent focus-visible:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring/50";
const compactButtonClass =
  "inline-flex min-h-7 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-40";
const iconButtonClass =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-30";

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

function selectTemplates(state: RendererState): readonly NotePropertyTemplate[] {
  return state.propertyTemplates ?? EMPTY_TEMPLATES;
}

function selectPeople(state: RendererState): ReadonlyMap<string, PersonRecord> {
  return state.people;
}

export function NotePropertiesPanel({ store, selectNoteId = selectActiveNoteId }: Props) {
  const noteId = useRendererSelector(store, selectNoteId);
  const selectProperties = useMemo(
    () =>
      (state: RendererState): readonly NoteProperty[] => {
        const id = selectNoteId(state);
        if (id === null) return EMPTY_PROPERTIES;
        return state.propertiesByNoteId.get(id) ?? EMPTY_PROPERTIES;
      },
    [selectNoteId],
  );
  const properties = useRendererSelector(store, selectProperties);
  const customTemplates = useRendererSelector(store, selectTemplates);
  const people = useRendererSelector(store, selectPeople);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const idFactory = useMemo(createBrowserPropertyIdFactory, []);

  function commit(operations: WorkspaceOperation[]): void {
    if (operations.length === 0) return;
    setError(null);
    setPending((count) => count + 1);
    void commitOperations(store, operations)
      .catch((reason: unknown) => setError(propertyErrorMessage(reason)))
      .finally(() => setPending((count) => Math.max(0, count - 1)));
  }

  if (noteId === null) return null;

  function addProperty(type: NotePropertyValue["type"], name: string): void {
    commit(addPropertyOperations(noteId!, properties, type, name, Date.now(), idFactory));
  }

  function applyTemplate(template: NotePropertyTemplate): void {
    commit(applyTemplateOperations(noteId!, properties, template, Date.now(), idFactory));
  }

  return (
    <div aria-busy={pending > 0}>
      {error && (
        <div
          role="alert"
          className="mb-1 flex items-start justify-between gap-2 rounded-md border-l-2 border-destructive bg-destructive/[0.07] px-2 py-1.5 text-[11px] leading-4 text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss property error"
            onClick={() => setError(null)}
            className="shrink-0 cursor-pointer rounded-md p-0.5 hover:bg-destructive/10 focus-visible:ring-1 focus-visible:ring-destructive/50"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {properties.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {properties.map((property) => (
            <PropertyRow
              key={property.id}
              property={property}
              people={people}
              onCommit={commit}
              onReorder={(offset) =>
                commit(reorderPropertyOperations(properties, property.id, offset, Date.now()))
              }
              idFactory={idFactory}
            />
          ))}
        </div>
      )}

      <div className="mt-0.5 flex items-center gap-1 opacity-55 transition-opacity duration-150 focus-within:opacity-100 group-hover/shelf:opacity-100">
        <AddPropertyButton onAdd={addProperty} />
        <TemplatePicker
          builtInTemplates={BUILT_IN_PROPERTY_TEMPLATES}
          customTemplates={customTemplates}
          replaceCount={properties.length}
          onApply={applyTemplate}
        />
        {pending > 0 && (
          <span role="status" className="ml-auto text-[10px] text-muted-foreground">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}

function PropertyTypePicker({
  property,
  onChange,
}: {
  property: NoteProperty;
  onChange: (next: NoteProperty) => void;
}) {
  const Icon = TYPE_ICON[property.value.type];
  return (
    <PropertyPopover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Change ${property.name} type`}
          aria-expanded={open}
          title={`Type: ${PROPERTY_TYPE_LABELS[property.value.type]}`}
          className={typeIconButtonClass}
        >
          <Icon size={14} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-44 p-1">
          <p className={menuHeadingClass}>Type</p>
          <div className="max-h-64 overflow-y-auto">
            {NOTE_PROPERTY_TYPES.map((type) => {
              const TypeIconComponent = TYPE_ICON[type];
              const selected = type === property.value.type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onChange(changeNotePropertyType(property, type));
                    close();
                  }}
                  className={cn(menuItemClass, selected && "bg-accent text-foreground")}
                >
                  <TypeIconComponent size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{PROPERTY_TYPE_LABELS[type]}</span>
                  {selected && <CheckIcon size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </PropertyPopover>
  );
}

function AddPropertyButton({
  onAdd,
}: {
  onAdd: (type: NotePropertyValue["type"], name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <PropertyPopover
      trigger={({ toggle, open }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className={ghostButtonClass}>
          <PlusIcon size={14} className="shrink-0" />
          Add property
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-56 p-1">
          <input
            autoFocus
            aria-label="New property name"
            name="new-property-name"
            value={name}
            placeholder="Property name…"
            onChange={(event) => setName(event.target.value)}
            className="mb-1 w-full rounded-md bg-accent/70 px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/55 focus-visible:ring-1 focus-visible:ring-ring/45"
          />
          <p className={menuHeadingClass}>Type</p>
          <div className="max-h-64 overflow-y-auto">
            {NOTE_PROPERTY_TYPES.map((type) => {
              const TypeIconComponent = TYPE_ICON[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onAdd(type, name);
                    setName("");
                    close();
                  }}
                  className={menuItemClass}
                >
                  <TypeIconComponent size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{PROPERTY_TYPE_LABELS[type]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </PropertyPopover>
  );
}

function TemplatePicker({
  builtInTemplates,
  customTemplates,
  replaceCount,
  onApply,
}: {
  builtInTemplates: readonly NotePropertyTemplate[];
  customTemplates: readonly NotePropertyTemplate[];
  replaceCount: number;
  onApply: (template: NotePropertyTemplate) => void;
}) {
  const [armedTemplate, setArmedTemplate] = useState<NotePropertyTemplate | null>(null);

  function pick(template: NotePropertyTemplate, close: () => void): void {
    if (replaceCount === 0) {
      onApply(template);
      close();
      return;
    }
    setArmedTemplate(template);
  }

  function renderTemplateItem(template: NotePropertyTemplate, close: () => void) {
    return (
      <button
        key={template.id}
        type="button"
        onClick={() => pick(template, close)}
        className={cn(
          menuItemClass,
          armedTemplate?.id === template.id && "bg-accent text-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{template.name}</span>
      </button>
    );
  }

  return (
    <PropertyPopover
      trigger={({ toggle, open }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className={ghostButtonClass}>
          <LayoutDashboardIcon size={14} className="shrink-0" />
          Templates
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-52 p-1">
          <p className={menuHeadingClass}>Replace properties with</p>
          <div className="max-h-64 overflow-y-auto">
            {builtInTemplates.map((template) => renderTemplateItem(template, close))}
            {customTemplates.length > 0 && (
              <>
                <div className="my-1 h-px bg-border/60" />
                <p className={menuHeadingClass}>Workspace</p>
                {customTemplates.map((template) => renderTemplateItem(template, close))}
              </>
            )}
          </div>
          {armedTemplate && (
            <InlineConfirm
              size="sm"
              className="border-t border-border/60 px-1 pt-1"
              message={`Replace ${replaceCount} ${replaceCount === 1 ? "property" : "properties"}?`}
              confirmLabel="Replace"
              armed
              onArmedChange={(armed) => {
                if (!armed) setArmedTemplate(null);
              }}
              onConfirm={() => {
                onApply(armedTemplate);
                setArmedTemplate(null);
                close();
              }}
              renderIdle={() => null}
            />
          )}
        </div>
      )}
    </PropertyPopover>
  );
}

type RowProps = {
  property: NoteProperty;
  people: ReadonlyMap<string, PersonRecord>;
  onCommit: Commit;
  onReorder: (offset: -1 | 1) => void;
  idFactory: IdFactory;
};

function PropertyRow({ property, people, onCommit, onReorder, idFactory }: RowProps) {
  function update(next: NoteProperty): void {
    onCommit(updatePropertyOperations(next, Date.now()));
  }

  function handleKeyboardReorder(event: KeyboardEvent<HTMLDivElement>): void {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    onReorder(event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <div className="group/row" data-property-id={property.id} onKeyDown={handleKeyboardReorder}>
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-36 shrink-0 items-center gap-1">
          <PropertyTypePicker property={property} onChange={update} />
          <PropertyName property={property} onUpdate={update} />
        </div>
        <div className="flex min-h-7 min-w-0 flex-1 items-center py-0.5">
          <ValueEditor property={property} people={people} onUpdate={update} />
        </div>
        <InlineConfirm
          size="sm"
          confirmLabel="Delete"
          message="Delete this property?"
          onConfirm={() => onCommit(deletePropertyOperations(property, Date.now()))}
          renderIdle={(arm) => (
            <button
              type="button"
              onClick={arm}
              aria-label={`Delete ${property.name}`}
              title={`Delete ${property.name} (Alt+↑/↓ reorders)`}
              className="mt-0.5 cursor-pointer rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring/50 group-hover/row:opacity-100"
            >
              <Trash2Icon size={13} />
            </button>
          )}
        />
      </div>
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
      className={cn(nameInputClass, invalid && "text-destructive focus-visible:ring-destructive/50")}
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
  if (value.type === "date") {
    return <DateValueEditor property={property} value={value} onUpdate={onUpdate} />;
  }
  if (value.type === "checkbox") {
    return (
      <label className="flex min-h-7 cursor-pointer items-center gap-2 px-1 text-[13px] text-muted-foreground">
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
            className="size-6 cursor-pointer rounded-md text-[15px] text-muted-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/55 aria-pressed:text-amber-500"
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
        className={cn(inputClass, "cursor-pointer", value.value === null && "text-muted-foreground/55")}
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
    value.type === "email"
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
    { type: "text" | "url" | "location" | "email" | "phone" }
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
      className={cn(inputClass, invalid && "text-destructive focus-visible:ring-destructive/50")}
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
  const selectedLabels = choices
    .filter((choice) => selectedSet.has(choice.id))
    .map((choice) => choice.label);
  return (
    <details className="relative w-full min-w-0">
      <summary
        className={cn(
          inputClass,
          "flex cursor-pointer list-none items-center justify-between gap-1",
          selected.length === 0 && "text-muted-foreground/55",
        )}
      >
        <span className="truncate">
          {selected.length === 0 ? "Empty" : selectedLabels.join(", ")}
        </span>
        <ChevronDownIcon size={12} className="shrink-0 text-muted-foreground" />
      </summary>
      <fieldset
        aria-label={`${label} choices`}
        className="absolute top-[calc(100%+4px)] left-0 z-50 max-h-40 w-full min-w-44 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
      >
        {choices.length === 0 ? (
          <p className="px-1.5 py-1 text-[11px] text-muted-foreground">{emptyLabel}</p>
        ) : (
          choices.map((choice) => (
            <label
              key={choice.id}
              className="flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[12px] hover:bg-accent/70"
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
  idFactory: IdFactory;
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
    <details className="mb-1 pl-6">
      <summary className={cn("cursor-pointer select-none transition-colors", sectionLabelClass)}>
        Options ({property.options.length})
      </summary>
      <div className="mt-1 space-y-1 border-l border-border/60 pl-2">
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
    <div className="group/option flex items-center gap-1">
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
      <select
        aria-label={`${option.label} color`}
        name={`property-option-${option.id}-color`}
        value={option.color}
        onChange={(event) =>
          onChange({ ...option, color: event.target.value as NotePropertyColor })
        }
        className={cn(inputClass, "w-20 shrink-0 cursor-pointer text-[12px] text-muted-foreground")}
      >
        {NOTE_PROPERTY_COLORS.map((color) => (
          <option key={color} value={color}>
            {PROPERTY_COLOR_LABELS[color]}
          </option>
        ))}
      </select>
      <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/option:opacity-100">
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
        <button
          type="button"
          aria-label={`Delete ${option.label} option`}
          onClick={onDelete}
          className={cn(iconButtonClass, "size-6")}
        >
          <Trash2Icon size={11} />
        </button>
      </span>
    </div>
  );
}
