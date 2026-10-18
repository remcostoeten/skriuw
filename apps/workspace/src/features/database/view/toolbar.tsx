import type { ReactNode } from "react";
import {
  columnValueKind,
  filterOperators,
  isGroupableColumn,
  operatorNeedsValue,
} from "@skriuw/renderer-core/database/arrange";
import type { DatabaseColumn } from "@skriuw/renderer-core/database/columns";
import {
  MAX_DATABASE_FILTERS,
  MAX_DATABASE_SORTS,
  type DatabaseFilter,
  type DatabaseSort,
  type FilterOperator,
  type SortDirection,
} from "@skriuw/renderer-core/database/config";
import { PropertyPopover } from "@/features/note-chrome/property-editing";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CloseIcon,
  FilterIcon,
  FolderIcon,
  LayoutDashboardIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  TableIcon,
} from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Select } from "@/shared/ui/select";
import {
  ghostSelectClass,
  iconButtonClass,
  menuItemClass,
  panelInputClass,
  toolButtonClass,
} from "./styles";
import type { DatabaseModel } from "./use-database";

type Props = {
  model: DatabaseModel;
  folderScoped: boolean;
  onNewNote: () => void;
};

type MenuProps = { model: DatabaseModel };

const OPERATOR_LABELS: Readonly<Record<FilterOperator, string>> = {
  contains: "contains",
  "not-contains": "does not contain",
  is: "is",
  "is-not": "is not",
  empty: "is empty",
  "not-empty": "is not empty",
  greater: "is greater than",
  less: "is less than",
  before: "is before",
  after: "is after",
  checked: "is checked",
  unchecked: "is not checked",
};

const DIRECTION_OPTIONS: readonly { value: SortDirection; label: string }[] = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];

function columnOptions(columns: readonly DatabaseColumn[]) {
  return columns.map((column) => ({ value: column.key, label: column.name }));
}

function Count({ value }: { value: number }) {
  if (value === 0) return null;
  return <span className="font-mono text-[10px] tabular-nums text-foreground">{value}</span>;
}

function MenuTrigger({
  icon,
  label,
  count,
  open,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(toolButtonClass, count > 0 && "text-foreground")}
      onClick={onToggle}
    >
      {icon}
      {label}
      <Count value={count} />
    </button>
  );
}

/**
 * The view's controls: layout, grouping, filters, sorts, column visibility,
 * subfolders, the quick title search and New. Every change except the search
 * is saved to this device's layout for the scope.
 */
export function DatabaseToolbar({ model, folderScoped, onNewNote }: Props) {
  const { view, columns } = model;
  const groupable = columns.filter(isGroupableColumn);
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      <div role="group" aria-label="Layout" className="flex items-center gap-0.5">
        <button
          type="button"
          aria-pressed={view.layout === "table"}
          className={cn(toolButtonClass, view.layout === "table" && "bg-accent")}
          onClick={() => model.updateView({ layout: "table" })}
        >
          <TableIcon size={13} />
          Table
        </button>
        <button
          type="button"
          aria-pressed={view.layout === "board"}
          className={cn(toolButtonClass, view.layout === "board" && "bg-accent")}
          onClick={() => model.updateView({ layout: "board" })}
        >
          <LayoutDashboardIcon size={13} />
          Board
        </button>
      </div>
      {view.layout === "board" && groupable.length > 0 && (
        <Select
          label="Group by"
          prefix="Group by"
          value={model.groupColumn?.key ?? ""}
          options={columnOptions(groupable)}
          onChange={(groupBy) => model.updateView({ groupBy })}
          align="start"
          triggerClassName={ghostSelectClass}
          menuClassName="w-max min-w-44 max-w-72"
        />
      )}
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <FilterMenu model={model} />
      <SortMenu model={model} />
      <PropertiesMenu model={model} />
      {folderScoped && (
        <button
          type="button"
          aria-pressed={view.subfolders}
          title="Include notes inside subfolders"
          className={cn(toolButtonClass, view.subfolders && "bg-accent")}
          onClick={() => model.updateView({ subfolders: !view.subfolders })}
        >
          <FolderIcon size={13} />
          Subfolders
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <label className="relative flex items-center">
          <span className="sr-only">Search names in this view</span>
          <SearchIcon
            size={12}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <input
            type="search"
            value={model.search}
            placeholder="Search"
            onChange={(event) => model.setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && model.search !== "") {
                event.stopPropagation();
                model.setSearch("");
              }
            }}
            className={cn(panelInputClass, "w-40 pl-7")}
          />
        </label>
        <Button variant="primary" disabled={model.status !== "ready"} onClick={onNewNote}>
          <PlusIcon size={12} />
          New
        </Button>
      </div>
    </div>
  );
}

function FilterMenu({ model }: MenuProps) {
  const { view, columns } = model;
  const filters = view.filters;

  function setFilters(next: readonly DatabaseFilter[]): void {
    model.updateView({ filters: next });
  }

  function addFilter(): void {
    const column = columns.find((entry) => entry.kind === "property") ?? columns[0];
    if (!column) return;
    const operator = filterOperators(column)[0] ?? "contains";
    setFilters([...filters, { column: column.key, operator, value: "" }]);
  }

  return (
    <PropertyPopover
      panelClassName="overflow-visible"
      renderTrigger={({ toggle, open }) => (
        <MenuTrigger
          icon={<FilterIcon size={13} />}
          label="Filter"
          count={filters.length}
          open={open}
          onToggle={toggle}
        />
      )}
    >
      {() => (
        <div className="flex w-[min(92vw,540px)] flex-col gap-1.5 p-2">
          <p className="px-1 text-[11px] text-muted-foreground">
            {filters.length === 0 ? "No filters yet." : "Notes must match every filter."}
          </p>
          {filters.map((filter, index) => (
            <FilterRow
              key={index}
              filter={filter}
              columns={columns}
              model={model}
              onChange={(next) =>
                setFilters(filters.map((entry, position) => (position === index ? next : entry)))
              }
              onRemove={() => setFilters(filters.filter((_, position) => position !== index))}
            />
          ))}
          <button
            type="button"
            className={menuItemClass}
            disabled={filters.length >= MAX_DATABASE_FILTERS || columns.length === 0}
            onClick={addFilter}
          >
            <PlusIcon size={12} />
            Add filter
          </button>
        </div>
      )}
    </PropertyPopover>
  );
}

function FilterRow({
  filter,
  columns,
  model,
  onChange,
  onRemove,
}: {
  filter: DatabaseFilter;
  columns: readonly DatabaseColumn[];
  model: DatabaseModel;
  onChange: (filter: DatabaseFilter) => void;
  onRemove: () => void;
}) {
  const column = columns.find((entry) => entry.key === filter.column);
  const operators = column ? filterOperators(column) : [];
  const inactive = column === undefined || !operators.includes(filter.operator);
  return (
    <div className="flex items-center gap-1.5">
      <Select
        label="Filter property"
        value={column ? filter.column : ""}
        placeholder="Missing property"
        options={columnOptions(columns)}
        onChange={(key) => {
          const next = columns.find((entry) => entry.key === key);
          if (!next) return;
          const nextOperators = filterOperators(next);
          const operator = nextOperators.includes(filter.operator)
            ? filter.operator
            : (nextOperators[0] ?? "contains");
          onChange({ column: key, operator, value: "" });
        }}
        align="start"
        className="w-36 shrink-0"
        triggerClassName={cn(ghostSelectClass, "w-full")}
        menuClassName="w-max min-w-44 max-w-72"
      />
      <Select
        label="Filter condition"
        value={inactive ? "" : filter.operator}
        placeholder="Condition"
        disabled={column === undefined}
        options={operators.map((operator) => ({
          value: operator,
          label: OPERATOR_LABELS[operator],
        }))}
        onChange={(operator) => onChange({ ...filter, operator })}
        align="start"
        className="w-36 shrink-0"
        triggerClassName={cn(ghostSelectClass, "w-full")}
        menuClassName="w-max min-w-40"
      />
      <div className="min-w-0 flex-1">
        {column && operatorNeedsValue(filter.operator) && (
          <FilterValue
            column={column}
            value={filter.value}
            model={model}
            onChange={(value) => onChange({ ...filter, value })}
          />
        )}
      </div>
      <button
        type="button"
        aria-label="Remove filter"
        className={iconButtonClass}
        onClick={onRemove}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

function FilterValue({
  column,
  value,
  model,
  onChange,
}: {
  column: DatabaseColumn;
  value: string;
  model: DatabaseModel;
  onChange: (value: string) => void;
}) {
  const kind = columnValueKind(column);
  if (kind === "options") {
    return (
      <Select
        label="Filter value"
        value={column.options.find((option) => option.label === value)?.label ?? ""}
        placeholder="Choose an option"
        options={column.options.map((option) => ({ value: option.label, label: option.label }))}
        onChange={onChange}
        align="start"
        className="w-full"
        triggerClassName={cn(ghostSelectClass, "w-full")}
        menuClassName="w-max min-w-40 max-w-72"
      />
    );
  }
  if (kind === "people") {
    return (
      <Select
        label="Filter value"
        value={model.people.has(value) ? value : ""}
        placeholder="Choose a person"
        options={[...model.people.values()]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((person) => ({ value: person.id, label: person.name }))}
        onChange={onChange}
        align="start"
        className="w-full"
        triggerClassName={cn(ghostSelectClass, "w-full")}
        menuClassName="w-max min-w-40 max-w-72"
      />
    );
  }
  return (
    <input
      key={column.key}
      type={kind === "date" ? "date" : "text"}
      inputMode={kind === "number" ? "decimal" : undefined}
      aria-label="Filter value"
      placeholder="Value"
      defaultValue={value}
      maxLength={200}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onChange(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onChange(event.currentTarget.value);
        }
      }}
      className={panelInputClass}
    />
  );
}

function SortMenu({ model }: MenuProps) {
  const { view, columns } = model;
  const sorts = view.sorts;

  function setSorts(next: readonly DatabaseSort[]): void {
    model.updateView({ sorts: next });
  }

  function addSort(): void {
    const used = new Set(sorts.map((sort) => sort.column));
    const column = columns.find((entry) => !used.has(entry.key));
    if (column) setSorts([...sorts, { column: column.key, direction: "asc" }]);
  }

  return (
    <PropertyPopover
      panelClassName="overflow-visible"
      renderTrigger={({ toggle, open }) => (
        <MenuTrigger
          icon={<ArrowUpDownIcon size={13} />}
          label="Sort"
          count={sorts.length}
          open={open}
          onToggle={toggle}
        />
      )}
    >
      {() => (
        <div className="flex w-[min(92vw,380px)] flex-col gap-1.5 p-2">
          <p className="px-1 text-[11px] text-muted-foreground">
            {sorts.length === 0 ? "Notes keep their folder order." : "The first sort wins ties."}
          </p>
          {sorts.map((sort, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Select
                label="Sort property"
                value={columns.some((column) => column.key === sort.column) ? sort.column : ""}
                placeholder="Missing property"
                options={columnOptions(
                  columns.filter(
                    (column) =>
                      column.key === sort.column ||
                      !sorts.some((entry) => entry.column === column.key),
                  ),
                )}
                onChange={(column) =>
                  setSorts(
                    sorts.map((entry, position) =>
                      position === index ? { ...entry, column } : entry,
                    ),
                  )
                }
                align="start"
                className="min-w-0 flex-1"
                triggerClassName={cn(ghostSelectClass, "w-full")}
                menuClassName="w-max min-w-44 max-w-72"
              />
              <Select
                label="Sort direction"
                value={sort.direction}
                options={DIRECTION_OPTIONS}
                onChange={(direction) =>
                  setSorts(
                    sorts.map((entry, position) =>
                      position === index ? { ...entry, direction } : entry,
                    ),
                  )
                }
                align="start"
                className="w-32 shrink-0"
                triggerClassName={cn(ghostSelectClass, "w-full")}
              />
              <button
                type="button"
                aria-label="Remove sort"
                className={iconButtonClass}
                onClick={() => setSorts(sorts.filter((_, position) => position !== index))}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={menuItemClass}
            disabled={sorts.length >= MAX_DATABASE_SORTS || sorts.length >= columns.length}
            onClick={addSort}
          >
            <PlusIcon size={12} />
            Add sort
          </button>
        </div>
      )}
    </PropertyPopover>
  );
}

function PropertiesMenu({ model }: MenuProps) {
  const { view, columns } = model;
  const hidden = new Set(view.hidden);
  const hiddenCount = columns.filter(
    (column) => column.key !== "title" && hidden.has(column.key),
  ).length;

  function setVisible(key: string, visible: boolean): void {
    const next = view.hidden.filter((entry) => entry !== key);
    model.updateView({ hidden: visible ? next : [...next, key] });
  }

  function moveColumn(index: number, offset: -1 | 1): void {
    const keys = columns.map((column) => column.key);
    const target = index + offset;
    const current = keys[index];
    const swapped = keys[target];
    if (current === undefined || swapped === undefined || target === 0) return;
    keys[index] = swapped;
    keys[target] = current;
    model.updateView({ order: keys.filter((key) => key !== "title") });
  }

  return (
    <PropertyPopover
      renderTrigger={({ toggle, open }) => (
        <MenuTrigger
          icon={<ListIcon size={13} />}
          label="Properties"
          count={hiddenCount}
          open={open}
          onToggle={toggle}
        />
      )}
    >
      {() => (
        <div className="flex max-h-[min(70vh,420px)] w-64 flex-col overflow-y-auto p-1.5">
          <p className="px-1.5 pb-1 text-[11px] text-muted-foreground">
            Properties come from the notes in this view.
          </p>
          {columns.map((column, index) => (
            <div
              key={column.key}
              className="group/property flex min-h-8 items-center gap-2 rounded-md px-1.5 hover:bg-accent/60"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[12px] text-foreground">
                <Checkbox
                  checked={column.key === "title" || !hidden.has(column.key)}
                  disabled={column.key === "title"}
                  onChange={(event) => setVisible(column.key, event.target.checked)}
                />
                <span className="truncate">{column.name}</span>
              </label>
              {column.key !== "title" && (
                <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/property:opacity-100">
                  <button
                    type="button"
                    aria-label={`Move ${column.name} left`}
                    disabled={index <= 1}
                    className={cn(iconButtonClass, "size-6")}
                    onClick={() => moveColumn(index, -1)}
                  >
                    <ArrowUpIcon size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${column.name} right`}
                    disabled={index >= columns.length - 1}
                    className={cn(iconButtonClass, "size-6")}
                    onClick={() => moveColumn(index, 1)}
                  >
                    <ArrowDownIcon size={11} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </PropertyPopover>
  );
}
