"use client"

import { useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { GroupLabel, Row, SectionHeader, SettingsButton, SettingsCard } from "../primitives"

type Shortcut = {
  id: string
  label: string
  description: string
  defaultCombo: string
  group: string
}

const SHORTCUTS: Shortcut[] = [
  { id: "new-note", label: "New note", description: "Create a blank note.", defaultCombo: "N", group: "Notes" },
  { id: "command-palette", label: "Command palette", description: "Search notes and run commands.", defaultCombo: "Ctrl+K", group: "Navigation" },
  { id: "toggle-sidebar", label: "Toggle sidebar", description: "Show or hide the file sidebar.", defaultCombo: "Ctrl+\\", group: "Navigation" },
  { id: "find-in-note", label: "Find in note", description: "Open find and replace in the editor.", defaultCombo: "Ctrl+F", group: "Editor" },
  { id: "search-workspace", label: "Search all notes", description: "Open workspace-wide search.", defaultCombo: "Ctrl+Shift+F", group: "Navigation" },
  { id: "open-inspector", label: "Open inspector", description: "Inspect the current note.", defaultCombo: "I", group: "Editor" },
]

function formatEvent(e: KeyboardEvent): string | null {
  if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl")
  if (e.altKey) parts.push("Alt")
  if (e.shiftKey) parts.push("Shift")
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return parts.join("+")
}

export function ShortcutsSection() {
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [recording, setRecording] = useState<string | null>(null)

  const hasOverrides = Object.keys(overrides).length > 0
  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)))

  useEffect(() => {
    if (!recording) return
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "Escape") {
        setRecording(null)
        return
      }
      const combo = formatEvent(e)
      if (combo) {
        setOverrides((o) => ({ ...o, [recording as string]: combo }))
        setRecording(null)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [recording])

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          title="Shortcuts"
          description="Rebind keyboard shortcuts. Changes are saved to this device."
        />
        {hasOverrides && (
          <SettingsButton icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setOverrides({})}>
            Reset all to defaults
          </SettingsButton>
        )}
      </div>

      {groups.map((group) => (
        <div key={group}>
          <GroupLabel>{group}</GroupLabel>
          <SettingsCard>
            {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => {
              const combo = overrides[shortcut.id] ?? shortcut.defaultCombo
              const overridden = shortcut.id in overrides
              const isRecording = recording === shortcut.id
              return (
                <Row key={shortcut.id} title={shortcut.label} description={shortcut.description}>
                  <div className="flex items-center gap-1.5">
                    {overridden && !isRecording && (
                      <button
                        onClick={() =>
                          setOverrides((o) => {
                            const next = { ...o }
                            delete next[shortcut.id]
                            return next
                          })
                        }
                        aria-label={`Reset ${shortcut.label} to default`}
                        title="Reset to default"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setRecording(isRecording ? null : shortcut.id)}
                      aria-label={`Rebind ${shortcut.label}, currently ${combo}`}
                      className={`inline-flex h-7 min-w-[5rem] items-center justify-center rounded-md border px-2.5 font-mono text-[11px] transition-colors ${
                        isRecording
                          ? "border-[var(--search-focus)] bg-[var(--accent)]/50 text-foreground"
                          : "border-border bg-[var(--muted)]/50 text-foreground hover:border-[var(--foreground)]/30"
                      }`}
                    >
                      {isRecording ? "Press keys…" : combo}
                    </button>
                  </div>
                </Row>
              )
            })}
          </SettingsCard>
        </div>
      ))}
    </div>
  )
}
