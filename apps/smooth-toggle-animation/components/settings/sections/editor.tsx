"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { GroupLabel, Row, SectionHeader, SettingsCard, Toggle } from "../primitives"

const FONT_GROUPS: Array<{ group: string; fonts: Array<{ id: string; label: string; family: string }> }> = [
  {
    group: "Sans",
    fonts: [
      { id: "inter", label: "Inter", family: "var(--font-sans), system-ui, sans-serif" },
      { id: "system", label: "System", family: "system-ui, sans-serif" },
    ],
  },
  {
    group: "Serif",
    fonts: [
      { id: "georgia", label: "Georgia", family: "Georgia, serif" },
      { id: "charter", label: "Charter", family: "Charter, Georgia, serif" },
    ],
  },
  {
    group: "Mono",
    fonts: [{ id: "geist-mono", label: "Geist Mono", family: "var(--font-mono), monospace" }],
  },
]

const LINE_HEIGHTS = [
  { id: "cozy", label: "Cozy", value: 1.45 },
  { id: "comfortable", label: "Comfortable", value: 1.7 },
  { id: "relaxed", label: "Relaxed", value: 1.95 },
]

export function EditorSection() {
  const [font, setFont] = useState("inter")
  const [lineHeight, setLineHeight] = useState("comfortable")
  const [rawMdx, setRawMdx] = useState(false)
  const [animatedNumbers, setAnimatedNumbers] = useState(true)
  const [vimMode, setVimMode] = useState(false)
  const [openInTabs, setOpenInTabs] = useState(false)
  const [detectTags, setDetectTags] = useState(true)

  const activeFont = FONT_GROUPS.flatMap((g) => g.fonts).find((f) => f.id === font)
  const activeLh = LINE_HEIGHTS.find((l) => l.id === lineHeight)

  return (
    <div>
      <SectionHeader title="Editor" description="How writing in Skriuw should feel." />

      <GroupLabel>Typography</GroupLabel>
      <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/40 p-5">
        {/* default font */}
        <div data-focus-id="editor-font" className="scroll-mt-24">
          <div className="text-sm font-medium text-foreground">Default font</div>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose a typeface for the rich text editor.</p>
          <div className="mt-4 space-y-4">
            {FONT_GROUPS.map((group) => (
              <div key={group.group}>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.fonts.map((f) => {
                    const selected = font === f.id
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFont(f.id)}
                        aria-pressed={selected}
                        className={`relative min-h-[5.5rem] rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? "border-[var(--foreground)]/60 bg-[var(--accent)]/40"
                            : "border-border hover:border-[var(--foreground)]/30"
                        }`}
                      >
                        {selected && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        <span aria-hidden="true" className="block text-[1.75rem] leading-none text-foreground" style={{ fontFamily: f.family }}>
                          Ag
                        </span>
                        <span className="mt-2 block text-xs font-medium text-foreground">{f.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* live preview */}
          <div className="mt-4 rounded-lg border border-[var(--border)]/60 bg-background p-4">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {"Preview · "}
              {activeFont?.label}
            </div>
            <p
              className="mt-2 text-sm text-foreground"
              style={{ fontFamily: activeFont?.family, lineHeight: activeLh?.value }}
            >
              The quick brown fox jumps over the lazy dog.
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Editor text uses this family for notes, titles, and body copy.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--border)]/50 pt-5" data-focus-id="line-height">
          <div className="text-sm font-medium text-foreground">Line height</div>
          <p className="mt-0.5 text-xs text-muted-foreground">Spacing between lines while you write.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LINE_HEIGHTS.map((lh) => (
              <button
                key={lh.id}
                onClick={() => setLineHeight(lh.id)}
                aria-pressed={lineHeight === lh.id}
                className={`min-w-[7.5rem] rounded-md border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  lineHeight === lh.id
                    ? "border-[var(--search-focus)] bg-[var(--accent)]/40 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {lh.label}
                <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{lh.value}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <GroupLabel>Behavior</GroupLabel>
      <SettingsCard>
        <Row
          title="Default to Raw MDX"
          description="New notes open in raw MDX mode."
          focusId="raw-mdx"
          visualization={<RawMdxDemo raw={rawMdx} />}
        >
          <Toggle checked={rawMdx} onChange={setRawMdx} label="Default to Raw MDX" />
        </Row>
        <Row
          title="Animated numbers"
          description="Animate changing counts in the inspector and status bar."
          visualization={<AnimatedNumberDemo animate={animatedNumbers} />}
        >
          <Toggle checked={animatedNumbers} onChange={setAnimatedNumbers} label="Animated numbers" />
        </Row>
        <Row
          title="Vim mode"
          description="Modal editing with Normal and Insert modes (h/j/k/l, w/b/e, dd, x, i/a/o, and more). Press Esc for Normal mode."
          focusId="vim-mode"
        >
          <Toggle checked={vimMode} onChange={setVimMode} label="Vim mode" />
        </Row>
        <Row
          title="Open notes in tabs"
          description="Keep opened notes in a tab bar instead of replacing the current note."
          focusId="open-in-tabs"
        >
          <Toggle checked={openInTabs} onChange={setOpenInTabs} label="Open notes in tabs" />
        </Row>
        <Row
          title="Detect #tags in note text"
          description="Turn #words written in plain text into workspace tags. Disable if your notes contain code comments or .env snippets — tags inserted via the # menu keep working either way."
          focusId="detect-tags-in-text"
        >
          <Toggle checked={detectTags} onChange={setDetectTags} label="Detect #tags in note text" />
        </Row>
      </SettingsCard>
    </div>
  )
}

function RawMdxDemo({ raw }: { raw: boolean }) {
  return (
    <div className="w-52 rounded-md border border-[var(--border)]/60 bg-background p-2.5 text-[10px]">
      {raw ? (
        <code className="font-mono text-muted-foreground">{"## Heading\n**bold** text"}</code>
      ) : (
        <div>
          <div className="text-xs font-semibold text-foreground">Heading</div>
          <div className="text-muted-foreground">
            <strong className="text-foreground">bold</strong> text
          </div>
        </div>
      )}
    </div>
  )
}

function AnimatedNumberDemo({ animate }: { animate: boolean }) {
  const [count, setCount] = useState(240)
  useEffect(() => {
    const t = setInterval(() => setCount((c) => (c >= 260 ? 240 : c + 1)), 900)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <span
        key={animate ? count : "static"}
        className={animate ? "animate-in fade-in slide-in-from-bottom-1 duration-300" : ""}
      >
        {animate ? count : 257}
      </span>
      words
    </div>
  )
}
