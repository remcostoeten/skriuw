"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  PROPERTY_TYPES,
  emptyValueFor,
  uid,
  type Property,
  type PropertyType,
} from "@/lib/note-properties"
import { TYPE_ICON } from "@/components/intro-primitives"
import { ValueEditor } from "@/components/value-editor"
import { Popover } from "@/components/popover"

export function PropertyRow({
  property,
  onChange,
  onRemove,
}: {
  property: Property
  onChange: (next: Property) => void
  onRemove: () => void
}) {
  const Icon = TYPE_ICON[property.type]
  return (
    <div className="group flex items-start gap-2">
      {/* Property label */}
      <div className="flex h-8 w-40 shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="size-4 shrink-0 opacity-70" />
        <input
          value={property.name}
          onChange={(e) => onChange({ ...property, name: e.target.value })}
          className="w-full rounded-sm bg-transparent py-0.5 outline-none transition-colors hover:text-foreground focus:text-foreground"
        />
      </div>

      {/* Value */}
      <div className="flex min-h-8 flex-1 items-center py-0.5">
        <ValueEditor property={property} onUpdate={(patch) => onChange({ ...property, ...patch })} />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${property.name}`}
        className="mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export function InlinePropertyChip({
  property,
  onChange,
  onRemove,
}: {
  property: Property
  onChange: (next: Property) => void
  onRemove: () => void
}) {
  const Icon = TYPE_ICON[property.type]
  return (
    <div className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-card/40 py-1 pl-2 pr-1 transition-colors hover:border-border">
      <Icon className="size-3.5 shrink-0 text-muted-foreground/70" />
      <input
        value={property.name}
        onChange={(e) => onChange({ ...property, name: e.target.value })}
        aria-label="Property name"
        style={{ width: `${Math.max(property.name.length, 3) + 1}ch` }}
        className="min-w-0 bg-transparent text-[12px] font-medium uppercase tracking-wide text-muted-foreground/70 outline-none focus:text-foreground"
      />
      <span className="h-3.5 w-px shrink-0 bg-border/70" aria-hidden />
      <div className="flex min-w-0 items-center text-[13px] [&_*]:text-[13px]">
        <ValueEditor
          property={property}
          density="inline"
          onUpdate={(patch) => onChange({ ...property, ...patch })}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${property.name}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

export function AddPropertyButton({
  onAdd,
  compact = false,
}: {
  onAdd: (property: Property) => void
  compact?: boolean
}) {
  const [name, setName] = useState("")

  function create(type: PropertyType, close: () => void) {
    const label = name.trim() || PROPERTY_TYPES.find((t) => t.type === type)?.label || "Property"
    const base: Property = { id: uid("prop"), type, name: label, value: emptyValueFor(type) }
    if (type === "select" || type === "multi-select") base.options = []
    onAdd(base)
    setName("")
    close()
  }

  return (
    <Popover
      trigger={({ toggle }) =>
        compact ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Add property"
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/70 px-2 py-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:border-border hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Property
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add property
          </button>
        )
      }
    >
      {({ close }) => (
        <div className="w-64 p-1.5">
          <input
            autoFocus
            value={name}
            placeholder="Property name…"
            onChange={(e) => setName(e.target.value)}
            className="mb-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <p className="px-1.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Type
          </p>
          <div className="max-h-64 overflow-y-auto">
            {PROPERTY_TYPES.map((meta) => {
              const Icon = TYPE_ICON[meta.type]
              return (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => create(meta.type, close)}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">{meta.label}</span>
                    <span className="block truncate text-xs text-muted-foreground/70">
                      {meta.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Popover>
  )
}
