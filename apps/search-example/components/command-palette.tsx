"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Calendar,
  CornerDownLeft,
  FilePlus2,
  FileText,
  Hash,
  PanelRight,
  Search,
  Settings,
  SquarePen,
  Workflow,
} from "lucide-react"

type Item = {
  id: string
  label: string
  hint?: string
  group: "Actions" | "Notes" | "Recent"
  icon: React.ReactNode
  shortcut?: string
}

const ITEMS: Item[] = [
  { id: "new-note", label: "New note", group: "Actions", icon: <SquarePen className="h-4 w-4" />, shortcut: "N" },
  { id: "new-file", label: "New file", group: "Actions", icon: <FilePlus2 className="h-4 w-4" /> },
  { id: "find", label: "Find in note", group: "Actions", icon: <Search className="h-4 w-4" />, shortcut: "⌘F" },
  { id: "toggle-inspector", label: "Toggle inspector panel", group: "Actions", icon: <PanelRight className="h-4 w-4" />, shortcut: "⌘\\" },
  { id: "settings", label: "Open settings", group: "Actions", icon: <Settings className="h-4 w-4" /> },
  { id: "n-welcome", label: "Welcome to Skriuw.md", hint: "#getting-started", group: "Notes", icon: <FileText className="h-4 w-4" /> },
  { id: "n-handbook", label: "Skriuw handbook", hint: "Guides", group: "Notes", icon: <FileText className="h-4 w-4" /> },
  { id: "n-gekke", label: "Gekke boy.md", group: "Notes", icon: <FileText className="h-4 w-4" /> },
  { id: "n-planning", label: "Planning issues", hint: "folder", group: "Notes", icon: <Workflow className="h-4 w-4" /> },
  { id: "n-lolly", label: "lollygat.md", group: "Notes", icon: <FileText className="h-4 w-4" /> },
  { id: "n-tag", label: "From idea to published note", hint: "#tag", group: "Notes", icon: <Hash className="h-4 w-4" /> },
  { id: "r-untitled", label: "Untitled.md", group: "Recent", icon: <Calendar className="h-4 w-4" /> },
  { id: "r-handbook", label: "Skriuw handbook", group: "Recent", icon: <Calendar className="h-4 w-4" /> },
]

const GROUP_ORDER: Item["group"][] = ["Actions", "Notes", "Recent"]

export function CommandPalette({
  open,
  onClose,
  onFind,
}: {
  open: boolean
  onClose: () => void
  onFind: () => void
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? ITEMS.filter(
          (i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q),
        )
      : ITEMS
    return filtered
  }, [query])

  // flat list mirrors render order so arrow keys map correctly
  const flat = useMemo(() => {
    const out: Item[] = []
    for (const g of GROUP_ORDER) out.push(...results.filter((r) => r.group === g))
    return out
  }, [results])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((a) => Math.min(a + 1, flat.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = flat[active]
        if (item) select(item)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, flat, active, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active])

  function select(item: Item) {
    onClose()
    if (item.id === "find") onFind()
  }

  if (!open) return null

  let runningIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-[var(--popover)] shadow-2xl shadow-black/40">
        {/* input */}
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes or type a command…"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded border border-border bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {flat.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              No results for “{query}”
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              const groupItems = results.filter((r) => r.group === group)
              if (groupItems.length === 0) return null
              return (
                <div key={group} className="px-1.5 pb-1">
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {group}
                  </div>
                  {groupItems.map((item) => {
                    runningIndex += 1
                    const index = runningIndex
                    const isActive = index === active
                    return (
                      <button
                        key={item.id}
                        data-index={index}
                        onMouseMove={() => setActive(index)}
                        onClick={() => select(item)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground"
                        }`}
                      >
                        <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                        {item.hint && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {item.hint}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-1.5">
                          {item.shortcut && (
                            <kbd className="rounded border border-border bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {item.shortcut}
                            </kbd>
                          )}
                          {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* footer */}
        <div className="flex items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 rotate-90" />
            <ArrowRight className="h-3 w-3 -rotate-90" />
            navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" />
            select
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded border border-border bg-[var(--muted)] px-1 text-[10px]">⌘K</kbd>
            command palette
          </span>
        </div>
      </div>
    </div>
  )
}
