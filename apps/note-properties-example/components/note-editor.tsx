"use client"

import { useState } from "react"
import { AlignLeft, Hash, LayoutTemplate, Plus, Rows3, X } from "lucide-react"
import { TEMPLATES, type Property, type Template } from "@/lib/note-properties"
import { AddPropertyButton, InlinePropertyChip, PropertyRow } from "@/components/property-row"
import { Popover } from "@/components/popover"

const STARTER = TEMPLATES.find((t) => t.id === "idea")!

type Layout = "rows" | "inline"

export function NoteEditor() {
  const [title, setTitle] = useState("Untitled")
  const [tags, setTags] = useState<string[]>([...STARTER.tags])
  const [properties, setProperties] = useState<Property[]>(() => STARTER.build())
  const [tagDraft, setTagDraft] = useState("")
  const [body, setBody] = useState("")
  const [layout, setLayout] = useState<Layout>("rows")

  function applyTemplate(t: Template) {
    setProperties(t.build())
    setTags((prev) => Array.from(new Set([...prev, ...t.tags])))
  }

  function addTag() {
    const value = tagDraft.trim().replace(/^#/, "")
    if (!value) return
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]))
    setTagDraft("")
  }

  function updateProperty(id: string, next: Property) {
    setProperties((prev) => prev.map((p) => (p.id === id ? next : p)))
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-10 sm:py-16">
      {/* Layout switcher */}
      <div className="mb-4 flex justify-end">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/40 p-0.5">
          <LayoutButton active={layout === "rows"} onClick={() => setLayout("rows")} icon={Rows3} label="Rows" />
          <LayoutButton active={layout === "inline"} onClick={() => setLayout("inline")} icon={AlignLeft} label="Inline" />
        </div>
      </div>

      {/* Title */}
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        rows={1}
        spellCheck={false}
        className="w-full resize-none bg-transparent text-4xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-5xl"
        placeholder="Untitled"
      />

      {/* Intro band: tags + properties */}
      <section className="mt-5 flex flex-col gap-3" aria-label="Note properties">
        {/* Tag chips */}
        {layout === "rows" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="group inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[13px] font-medium text-muted-foreground"
              >
                <Hash className="size-3 opacity-60" />
                {tag}
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  aria-label={`Remove tag ${tag}`}
                  className="opacity-50 transition-opacity hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  addTag()
                }
                if (e.key === "Backspace" && !tagDraft && tags.length) {
                  setTags((prev) => prev.slice(0, -1))
                }
              }}
              onBlur={addTag}
              placeholder={tags.length ? "" : "Add a tag"}
              className="min-w-20 flex-1 bg-transparent py-0.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
              aria-label="Add tag"
            />
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-lg border border-border/50 bg-card/25 px-2 py-1.5">
            <span className="mt-1 flex size-5 items-center justify-center rounded-md bg-accent/70 text-muted-foreground">
              <Hash className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="group inline-flex max-w-full items-center gap-1 rounded-md border border-border/50 bg-background/50 py-0.5 pl-2 pr-1 text-[13px] font-medium leading-5 text-foreground/85 transition-colors hover:border-border hover:bg-accent/60"
                >
                  <span className="min-w-0 truncate">{tag}</span>
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    aria-label={`Remove tag ${tag}`}
                    className="rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-background/70 hover:text-foreground hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTag()
                  }
                  if (e.key === "Backspace" && !tagDraft && tags.length) {
                    setTags((prev) => prev.slice(0, -1))
                  }
                }}
                onBlur={addTag}
                placeholder={tags.length ? "Add tag" : "Add a tag"}
                className="min-h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
                aria-label="Add tag"
              />
            </div>
          </div>
        )}

        {/* Properties — two layout styles */}
        {layout === "rows" ? (
          <div className="flex flex-col gap-0.5 border-t border-border/60 pt-3">
            {properties.map((property) => (
              <PropertyRow
                key={property.id}
                property={property}
                onChange={(next) => updateProperty(property.id, next)}
                onRemove={() => setProperties((prev) => prev.filter((p) => p.id !== property.id))}
              />
            ))}

            {/* Toolbar: add property + templates */}
            <div className="mt-1 flex items-center gap-1">
              <AddPropertyButton onAdd={(p) => setProperties((prev) => [...prev, p])} />
              <TemplatePicker onApply={applyTemplate} />
            </div>
          </div>
        ) : (
          <div className="border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {properties.map((property) => (
                <InlinePropertyChip
                  key={property.id}
                  property={property}
                  onChange={(next) => updateProperty(property.id, next)}
                  onRemove={() => setProperties((prev) => prev.filter((p) => p.id !== property.id))}
                />
              ))}
              <AddPropertyButton compact onAdd={(p) => setProperties((prev) => [...prev, p])} />
            </div>
            <div className="mt-2">
              <TemplatePicker onApply={applyTemplate} />
            </div>
          </div>
        )}
      </section>

      {/* Body */}
      <div className="mt-6 border-t border-border/60 pt-6">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
          placeholder="Start writing here. Use # for tags, @ to mention notes, or /tag and /link note from the block editor."
        />
      </div>
    </article>
  )
}

function LayoutButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Rows3
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function TemplatePicker({ onApply }: { onApply: (t: Template) => void }) {
  return (
    <Popover
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LayoutTemplate className="size-3.5" />
          Templates
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-72 p-1.5">
          <p className="px-1.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Replace properties with
          </p>
          <div className="max-h-72 overflow-y-auto">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onApply(t)
                  close()
                }}
                className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
                  <Plus className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{t.name}</span>
                  <span className="block text-xs text-muted-foreground/70">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}
