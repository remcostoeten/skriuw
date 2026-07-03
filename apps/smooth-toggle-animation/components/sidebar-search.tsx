"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CaseSensitive, ChevronDown, ChevronRight, FileText, Regex, WholeWord, X } from "lucide-react"
import { WORKSPACE_NOTES } from "@/lib/workspace-data"

type LineMatch = {
  line: string
  lineIndex: number
  ranges: Array<[number, number]>
}

type FileResult = {
  id: string
  name: string
  matches: LineMatch[]
}

function buildRegex(query: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean) {
  if (!query) return null
  let source = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  if (wholeWord) source = `\\b(?:${source})\\b`
  try {
    return new RegExp(source, caseSensitive ? "g" : "gi")
  } catch {
    return null
  }
}

export function SidebarSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { results, total, invalid } = useMemo(() => {
    const regex = buildRegex(query.trim(), caseSensitive, wholeWord, useRegex)
    if (query.trim() && !regex) return { results: [] as FileResult[], total: 0, invalid: true }
    if (!regex) return { results: [] as FileResult[], total: 0, invalid: false }

    const out: FileResult[] = []
    let count = 0
    for (const note of WORKSPACE_NOTES) {
      const matches: LineMatch[] = []
      note.lines.forEach((line, lineIndex) => {
        const ranges: Array<[number, number]> = []
        regex.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = regex.exec(line)) !== null) {
          if (m[0].length === 0) {
            regex.lastIndex += 1
            continue
          }
          ranges.push([m.index, m.index + m[0].length])
        }
        if (ranges.length > 0) {
          matches.push({ line, lineIndex, ranges })
          count += ranges.length
        }
      })
      if (matches.length > 0) out.push({ id: note.id, name: note.name, matches })
    }
    return { results: out, total: count, invalid: false }
  }, [query, caseSensitive, wholeWord, useRegex])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">SEARCH</span>
        <button
          onClick={onClose}
          aria-label="Close search"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* input + toggles */}
      <div className="px-3">
        <div className="flex items-center rounded-md border border-[var(--search-input-border)] bg-[var(--search-input)] focus-within:border-[var(--search-focus)]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose()
            }}
            placeholder="Search all notes"
            aria-label="Search all notes"
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center gap-0.5 pr-1">
            <SearchToggle
              pressed={caseSensitive}
              onClick={() => setCaseSensitive((v) => !v)}
              label="Match Case"
            >
              <CaseSensitive className="h-3.5 w-3.5" />
            </SearchToggle>
            <SearchToggle
              pressed={wholeWord}
              onClick={() => setWholeWord((v) => !v)}
              label="Match Whole Word"
            >
              <WholeWord className="h-3.5 w-3.5" />
            </SearchToggle>
            <SearchToggle
              pressed={useRegex}
              onClick={() => setUseRegex((v) => !v)}
              label="Use Regular Expression"
            >
              <Regex className="h-3.5 w-3.5" />
            </SearchToggle>
          </div>
        </div>
        <div className="px-0.5 pt-1.5 text-[11px] text-muted-foreground">
          {invalid
            ? "Invalid regular expression"
            : query.trim()
              ? total > 0
                ? `${total} result${total === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}`
                : "No results found"
              : "Type to search across the workspace"}
        </div>
      </div>

      {/* results */}
      <div className="mt-1 flex-1 overflow-y-auto px-2 pb-4">
        {results.map((file) => {
          const isCollapsed = collapsed[file.id]
          return (
            <div key={file.id} className="mt-1">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [file.id]: !c[file.id] }))}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-sidebar-foreground hover:bg-sidebar-accent/50"
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{file.name}</span>
                <span className="ml-auto rounded-full bg-[var(--muted)] px-1.5 text-[10px] text-muted-foreground">
                  {file.matches.reduce((n, m) => n + m.ranges.length, 0)}
                </span>
              </button>
              {!isCollapsed && (
                <ul className="mt-0.5 space-y-px">
                  {file.matches.map((match) => (
                    <li key={`${file.id}-${match.lineIndex}`}>
                      <button className="block w-full rounded px-2 py-1 pl-7 text-left text-[12px] leading-5 text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
                        <Snippet line={match.line} ranges={match.ranges} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Snippet({ line, ranges }: { line: string; ranges: Array<[number, number]> }) {
  // Trim long lines around the first match, VS Code style.
  const [first] = ranges
  let offset = 0
  let text = line
  if (first && first[0] > 28) {
    offset = first[0] - 20
    text = "…" + line.slice(offset)
    offset -= 1 // account for ellipsis char
  }

  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    const s = start - offset
    const e = end - offset
    if (s < 0 || s >= text.length) return
    if (s > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, s)}</span>)
    parts.push(
      <mark key={`m${i}`} className="rounded-[2px] bg-[var(--search-match-bg)] px-px text-foreground">
        {text.slice(s, Math.min(e, text.length))}
      </mark>,
    )
    cursor = Math.min(e, text.length)
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)

  return <span className="line-clamp-1 break-all">{parts}</span>
}

function SearchToggle({
  pressed,
  onClick,
  label,
  children,
}: {
  pressed: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={`flex h-5.5 w-5.5 items-center justify-center rounded p-0.5 transition-colors ${
        pressed
          ? "bg-[var(--search-toggle-active)] text-foreground outline outline-1 outline-[var(--search-focus)]"
          : "text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}
