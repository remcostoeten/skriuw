"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { GroupLabel, Row, SectionHeader, SettingsCard, Toggle } from "../primitives"

const THEMES = [
  { id: "midnight", label: "Skriuw", from: "hsl(0 0% 7%)", to: "hsl(0 0% 15%)" },
  { id: "graphite", label: "Graphite", from: "hsl(220 6% 12%)", to: "hsl(220 6% 22%)" },
  { id: "paper", label: "Paper", from: "hsl(40 18% 96%)", to: "hsl(40 14% 88%)" },
  { id: "monokai", label: "Monokai", from: "hsl(70 8% 14%)", to: "hsl(54 100% 62%)" },
]

export function AppearanceSection() {
  const [theme, setTheme] = useState("midnight")
  const [compactSidebar, setCompactSidebar] = useState(false)
  const [treeGuides, setTreeGuides] = useState(false)
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  return (
    <div>
      <SectionHeader
        title="Appearance"
        description="Make Skriuw feel like yours. Changes apply across your account."
      />

      <GroupLabel>Theme</GroupLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => {
          const selected = theme === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-pressed={selected}
              className={`group relative overflow-hidden rounded-lg border text-left transition-colors ${
                selected ? "border-[var(--search-focus)]" : "border-border hover:border-[var(--border)]"
              }`}
            >
              <span
                aria-hidden="true"
                className="block h-20 w-full"
                style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
              />
              <span className="flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground">
                {t.label}
                {selected && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <GroupLabel>Interface</GroupLabel>
      <SettingsCard>
        <Row
          title="Compact sidebar"
          description="Tighter spacing in the file tree."
          focusId="compact-sidebar"
          visualization={<CompactSidebarDemo compact={compactSidebar} />}
        >
          <Toggle checked={compactSidebar} onChange={setCompactSidebar} label="Compact sidebar" />
        </Row>
        <Row
          title="File tree guide lines"
          description="Show nested ruler lines in the notes sidebar."
          focusId="tree-guides"
          visualization={<TreeGuidesDemo guides={treeGuides} />}
        >
          <Toggle checked={treeGuides} onChange={setTreeGuides} label="File tree guide lines" />
        </Row>
        <Row
          title="Show line numbers"
          description="In the editor gutter."
          focusId="line-numbers"
          visualization={<LineNumbersDemo on={showLineNumbers} />}
        >
          <Toggle checked={showLineNumbers} onChange={setShowLineNumbers} label="Show line numbers" />
        </Row>
        <Row title="Reduce motion" description="Minimize transitions and animations." focusId="reduce-motion">
          <Toggle checked={reduceMotion} onChange={setReduceMotion} label="Reduce motion" />
        </Row>
      </SettingsCard>
    </div>
  )
}

/* live preview demos */

function DemoFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-44 rounded-md border border-[var(--border)]/60 bg-sidebar p-2 text-[10px] text-sidebar-foreground">
      {children}
    </div>
  )
}

function CompactSidebarDemo({ compact }: { compact: boolean }) {
  return (
    <DemoFrame>
      <div className={compact ? "space-y-0.5" : "space-y-1.5"}>
        {["Welcome.md", "Handbook", "Journal"].map((n) => (
          <div key={n} className={`rounded bg-[var(--muted)]/50 px-1.5 ${compact ? "py-0.5" : "py-1"}`}>
            {n}
          </div>
        ))}
      </div>
    </DemoFrame>
  )
}

function TreeGuidesDemo({ guides }: { guides: boolean }) {
  return (
    <DemoFrame>
      <div>Folder</div>
      <div className={`ml-1.5 mt-0.5 space-y-0.5 pl-2 ${guides ? "border-l border-[var(--border)]" : ""}`}>
        <div>Nested note</div>
        <div>Another note</div>
      </div>
    </DemoFrame>
  )
}

function LineNumbersDemo({ on }: { on: boolean }) {
  return (
    <DemoFrame>
      {["The quick brown fox", "jumps over the", "lazy dog."].map((l, i) => (
        <div key={l} className="flex gap-1.5">
          {on && <span className="w-3 text-right text-muted-foreground/60">{i + 1}</span>}
          <span>{l}</span>
        </div>
      ))}
    </DemoFrame>
  )
}
