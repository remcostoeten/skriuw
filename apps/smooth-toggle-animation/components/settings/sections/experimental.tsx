"use client"

import { useState } from "react"
import { FlaskConical } from "lucide-react"
import { GroupLabel, Row, SectionHeader, SettingsCard, Toggle } from "../primitives"

const FLAGS = [
  {
    id: "canvas",
    title: "Canvas view",
    description: "Arrange notes spatially on an infinite canvas with connectors.",
  },
  {
    id: "graph",
    title: "Graph view",
    description: "Visualize links between notes as an interactive graph.",
  },
  {
    id: "vim",
    title: "Vim key bindings",
    description: "Modal editing in the block editor. Escape hatches included.",
  },
  {
    id: "offline",
    title: "Offline-first sync",
    description: "Local-first storage with background sync when you reconnect.",
  },
  {
    id: "publish",
    title: "Publish notes",
    description: "Share a note as a public read-only page with a single link.",
  },
]

export function ExperimentalSection() {
  const [flags, setFlags] = useState<Record<string, boolean>>({ graph: true })

  return (
    <div>
      <SectionHeader
        title="Experimental"
        description="Preview features that are still in development. Things may break."
      />

      <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-[var(--border)]/60 bg-[var(--muted)]/30 px-4 py-3">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Experimental features can change or disappear without notice. They are safe to toggle — your notes are never
          at risk — but the features themselves may be unstable.
        </p>
      </div>

      <GroupLabel>Feature flags</GroupLabel>
      <SettingsCard>
        {FLAGS.map((flag) => (
          <Row key={flag.id} title={flag.title} description={flag.description}>
            <Toggle
              checked={!!flags[flag.id]}
              onChange={(v) => setFlags((f) => ({ ...f, [flag.id]: v }))}
              label={flag.title}
            />
          </Row>
        ))}
      </SettingsCard>
    </div>
  )
}
