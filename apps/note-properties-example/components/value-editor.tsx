"use client"

import { useState } from "react"
import { Check, Plus, Star } from "lucide-react"
import {
  DIRECTORY,
  TAG_COLOR_KEYS,
  uid,
  type Property,
  type SelectOption,
} from "@/lib/note-properties"
import { Avatar, Pill } from "@/components/intro-primitives"
import { Popover } from "@/components/popover"

type Patch = Partial<Pick<Property, "value" | "options">>

interface EditorProps {
  property: Property
  onUpdate: (patch: Patch) => void
  density?: "default" | "inline"
}

const FIELD_CLASS =
  "w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none"

function asString(v: Property["value"]): string {
  return typeof v === "string" ? v : ""
}

function TextLike({ property, onUpdate, placeholder, type = "text" }: EditorProps & { placeholder: string; type?: string }) {
  return (
    <input
      type={type}
      value={asString(property.value)}
      placeholder={placeholder}
      onChange={(e) => onUpdate({ value: e.target.value })}
      className={FIELD_CLASS}
    />
  )
}

function NumberEditor({ property, onUpdate }: EditorProps) {
  return (
    <input
      type="number"
      value={property.value === null || property.value === undefined ? "" : String(property.value)}
      placeholder="Empty"
      onChange={(e) => onUpdate({ value: e.target.value === "" ? null : Number(e.target.value) })}
      className={FIELD_CLASS}
    />
  )
}

function DateEditor({ property, onUpdate }: EditorProps) {
  return (
    <input
      type="date"
      value={asString(property.value)}
      onChange={(e) => onUpdate({ value: e.target.value })}
      className={`${FIELD_CLASS} [color-scheme:dark]`}
    />
  )
}

function CheckboxEditor({ property, onUpdate }: EditorProps) {
  const checked = property.value === true
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onUpdate({ value: !checked })}
      className={`flex size-[18px] items-center justify-center rounded-[5px] border transition-colors ${
        checked ? "border-transparent bg-primary text-primary-foreground" : "border-border hover:bg-accent"
      }`}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  )
}

function RatingEditor({ property, onUpdate }: EditorProps) {
  const value = typeof property.value === "number" ? property.value : 0
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (hover || value) >= n
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onUpdate({ value: value === n ? null : n })}
            className="p-0.5"
          >
            <Star
              className={`size-[18px] transition-colors ${active ? "text-amber-400" : "text-muted-foreground/40"}`}
              fill={active ? "currentColor" : "none"}
            />
          </button>
        )
      })}
    </div>
  )
}

function nextColor(options: SelectOption[]) {
  return TAG_COLOR_KEYS[options.length % TAG_COLOR_KEYS.length]
}

function OptionPicker({
  property,
  onUpdate,
  multi,
  density = "default",
}: EditorProps & { multi: boolean }) {
  const options = property.options ?? []
  const selected = multi
    ? (Array.isArray(property.value) ? (property.value as string[]) : [])
    : property.value
      ? [property.value as string]
      : []
  const [query, setQuery] = useState("")

  function toggle(id: string) {
    if (multi) {
      const set = new Set(selected)
      set.has(id) ? set.delete(id) : set.add(id)
      onUpdate({ value: Array.from(set) })
    } else {
      onUpdate({ value: selected[0] === id ? "" : id })
    }
  }

  function createOption() {
    const label = query.trim()
    if (!label) return
    const option: SelectOption = { id: uid("opt"), label, color: nextColor(options) }
    const newOptions = [...options, option]
    setQuery("")
    if (multi) {
      onUpdate({ options: newOptions, value: [...selected, option.id] })
    } else {
      onUpdate({ options: newOptions, value: option.id })
    }
  }

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase().trim()))
  const exact = options.some((o) => o.label.toLowerCase() === query.toLowerCase().trim())
  const selectedOptions = options.filter((o) => selected.includes(o.id))
  const inline = density === "inline"
  const visibleInlineOptions = selectedOptions.slice(0, multi ? 2 : 1)
  const hiddenInlineCount = selectedOptions.length - visibleInlineOptions.length

  return (
    <Popover
      trigger={({ toggle: t }) => (
        <button
          type="button"
          onClick={t}
          className={
            inline
              ? "inline-flex min-h-6 max-w-[18rem] items-center gap-1 overflow-hidden rounded-md px-0.5 py-0 text-left transition-colors hover:bg-accent/50"
              : "flex min-h-7 w-full flex-wrap items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/50"
          }
        >
          {selectedOptions.length > 0 ? (
            inline ? (
              <>
                {visibleInlineOptions.map((o) => (
                  <Pill key={o.id} label={o.label} color={o.color} dot />
                ))}
                {hiddenInlineCount > 0 && (
                  <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-medium leading-5 text-muted-foreground">
                    +{hiddenInlineCount}
                  </span>
                )}
              </>
            ) : (
              selectedOptions.map((o) => <Pill key={o.id} label={o.label} color={o.color} dot />)
            )
          ) : (
            <span className={inline ? "px-1 text-[13px] text-muted-foreground/60" : "px-1 text-[15px] text-muted-foreground/60"}>Empty</span>
          )}
        </button>
      )}
    >
      {() => (
        <div className="w-60 p-1.5">
          <input
            autoFocus
            value={query}
            placeholder="Search or create…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !exact && query.trim()) createOption()
            }}
            className="mb-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
              >
                <Pill label={o.label} color={o.color} dot />
                {selected.includes(o.id) && <Check className="size-4 text-muted-foreground" />}
              </button>
            ))}
            {query.trim() && !exact && (
              <button
                type="button"
                onClick={createOption}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
              >
                <Plus className="size-3.5" />
                Create
                <Pill label={query.trim()} color={nextColor(options)} dot />
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-1.5 py-2 text-sm text-muted-foreground/60">No options yet</p>
            )}
          </div>
        </div>
      )}
    </Popover>
  )
}

function PersonEditor({ property, onUpdate, density = "default" }: EditorProps) {
  const selected = Array.isArray(property.value) ? (property.value as string[]) : []
  const [query, setQuery] = useState("")

  function toggle(id: string) {
    const set = new Set(selected)
    set.has(id) ? set.delete(id) : set.add(id)
    onUpdate({ value: Array.from(set) })
  }

  const people = DIRECTORY.filter((p) => p.name.toLowerCase().includes(query.toLowerCase().trim()))
  const selectedPeople = DIRECTORY.filter((p) => selected.includes(p.id))
  const inline = density === "inline"
  const visibleInlinePeople = selectedPeople.slice(0, 2)
  const hiddenInlineCount = selectedPeople.length - visibleInlinePeople.length

  return (
    <Popover
      trigger={({ toggle: t }) => (
        <button
          type="button"
          onClick={t}
          className={
            inline
              ? "inline-flex min-h-6 max-w-[18rem] items-center gap-1 overflow-hidden rounded-md px-0.5 py-0 text-left transition-colors hover:bg-accent/50"
              : "flex min-h-7 w-full flex-wrap items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/50"
          }
        >
          {selectedPeople.length > 0 ? (
            (inline ? visibleInlinePeople : selectedPeople).map((p) => (
              <span
                key={p.id}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-accent py-0.5 pl-0.5 pr-2 text-[13px]"
              >
                <Avatar name={p.name} color={p.color} />
                <span className="truncate">{p.name}</span>
              </span>
            ))
          ) : (
            <span className={inline ? "px-1 text-[13px] text-muted-foreground/60" : "px-1 text-[15px] text-muted-foreground/60"}>Empty</span>
          )}
          {hiddenInlineCount > 0 && (
            <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-medium leading-5 text-muted-foreground">
              +{hiddenInlineCount}
            </span>
          )}
        </button>
      )}
    >
      {() => (
        <div className="w-60 p-1.5">
          <input
            autoFocus
            value={query}
            placeholder="Search people…"
            onChange={(e) => setQuery(e.target.value)}
            className="mb-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <div className="max-h-56 overflow-y-auto">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Avatar name={p.name} color={p.color} size={22} />
                  {p.name}
                </span>
                {selected.includes(p.id) && <Check className="size-4 text-muted-foreground" />}
              </button>
            ))}
            {people.length === 0 && (
              <p className="px-1.5 py-2 text-sm text-muted-foreground/60">No matches</p>
            )}
          </div>
        </div>
      )}
    </Popover>
  )
}

function UrlEditor({ property, onUpdate }: EditorProps) {
  const value = asString(property.value)
  const [editing, setEditing] = useState(false)
  if (value && !editing) {
    return (
      <a
        href={value.startsWith("http") ? value : `https://${value}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return
          e.preventDefault()
          setEditing(true)
        }}
        className="truncate text-[15px] text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:decoration-blue-400"
      >
        {value}
      </a>
    )
  }
  return (
    <input
      autoFocus={editing}
      type="url"
      value={value}
      placeholder="https://…"
      onChange={(e) => onUpdate({ value: e.target.value })}
      onBlur={() => setEditing(false)}
      className={FIELD_CLASS}
    />
  )
}

export function ValueEditor({ property, onUpdate, density = "default" }: EditorProps) {
  switch (property.type) {
    case "number":
      return <NumberEditor property={property} onUpdate={onUpdate} />
    case "date":
      return <DateEditor property={property} onUpdate={onUpdate} />
    case "checkbox":
      return <CheckboxEditor property={property} onUpdate={onUpdate} />
    case "rating":
      return <RatingEditor property={property} onUpdate={onUpdate} />
    case "select":
      return <OptionPicker property={property} onUpdate={onUpdate} multi={false} density={density} />
    case "multi-select":
      return <OptionPicker property={property} onUpdate={onUpdate} multi density={density} />
    case "person":
      return <PersonEditor property={property} onUpdate={onUpdate} density={density} />
    case "url":
      return <UrlEditor property={property} onUpdate={onUpdate} />
    case "email":
      return <TextLike property={property} onUpdate={onUpdate} placeholder="name@email.com" type="email" />
    case "phone":
      return <TextLike property={property} onUpdate={onUpdate} placeholder="+31 6 …" type="tel" />
    case "location":
      return <TextLike property={property} onUpdate={onUpdate} placeholder="Add a place" />
    default:
      return <TextLike property={property} onUpdate={onUpdate} placeholder="Empty" />
  }
}
