"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { CommandPalette } from "@/components/command-palette"
import { SidebarSearch } from "@/components/sidebar-search"
import { SettingsModal } from "@/components/settings/settings-modal"
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderTree,
  Hash,
  Link2,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Workflow,
} from "lucide-react"

const NoteEditor = dynamic(
  () => import("@/components/note-editor").then((mod) => mod.NoteEditor),
  { ssr: false, loading: () => <EditorSkeleton /> },
)

function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-10">
      <div className="h-10 w-2/3 rounded bg-[var(--muted)]" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-full rounded bg-[var(--muted)]/60" />
        <div className="h-4 w-5/6 rounded bg-[var(--muted)]/60" />
        <div className="h-4 w-3/4 rounded bg-[var(--muted)]/60" />
      </div>
    </div>
  )
}

const files = [
  { name: "Welcome to Skriuw.md", active: true },
  { name: "Skriuw handbook" },
  { name: "Welcome to Skriuw.md" },
  { name: "Untitled", folder: true, count: 0 },
  { name: "Planning issues", folder: true, count: 1 },
  { name: "Untitled.md", indent: true },
  { name: "Untitled", folder: true, count: 0 },
  { name: "Gekke boy.md" },
  { name: "Untitled.md" },
  { name: "this is a note.md" },
  { name: "this is a new note.md" },
  { name: "lollygat.md" },
]

const recents = ["Untitled.md", "Gekke boy.md", "Skriuw handbook", "Welcome to Skriuw.md"]

const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

export function AppShell() {
  const openSearchRef = useRef<(() => void) | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<"files" | "search">("files")

  // Global shortcuts: Cmd/Ctrl+K palette, Cmd/Ctrl+Shift+F workspace search.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === "k") {
        event.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (key === "f" && event.shiftKey) {
        event.preventDefault()
        setSidebarMode("search")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* icon rail */}
      <nav className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar py-3">
        <div className="flex flex-col items-center gap-1.5">
          <RailIcon icon={<PanelLeft className="h-[18px] w-[18px]" />} label="Toggle sidebar" />
          <RailIcon icon={<SquarePen className="h-[18px] w-[18px]" />} label="New note" />
          <RailIcon icon={<FilePlus2 className="h-[18px] w-[18px]" />} label="New file" />
          <RailIcon icon={<PanelRight className="h-[18px] w-[18px]" />} label="Panels" />
          <RailIcon
            icon={<FolderTree className="h-[18px] w-[18px]" />}
            label="Files"
            onClick={() => setSidebarMode("files")}
          />
          <RailIcon
            icon={<Search className="h-[18px] w-[18px]" />}
            label="Search all notes"
            onClick={() => setSidebarMode((m) => (m === "search" ? "files" : "search"))}
          />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <RailIcon
            icon={<Settings className="h-[18px] w-[18px]" />}
            label="Settings"
            onClick={() => setSettingsOpen(true)}
          />
          <span className="mt-1 h-6 w-6 rounded-full border border-sidebar-border bg-[var(--muted)]" />
        </div>
      </nav>

      {/* file sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        {sidebarMode === "search" ? (
          <SidebarSearch onClose={() => setSidebarMode("files")} />
        ) : (
          <>
        <div className="flex items-center gap-2 px-3 py-2.5 text-sidebar-foreground">
          <Folder className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-medium">Notes</span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 text-[13px]">
          <ul className="space-y-0.5">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                    file.active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  } ${file.indent ? "pl-6" : ""}`}
                >
                  {file.folder ? (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{file.name}</span>
                  {file.count !== undefined && (
                    <span className="ml-auto text-[11px] text-muted-foreground">{file.count}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* journal / calendar */}
          <div className="mt-5 px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
              JOURNAL
            </div>
            <div className="mt-3 rounded-md">
              <div className="mb-2 flex items-center justify-between px-1 text-[12px] text-sidebar-foreground">
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">June 2026</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] text-muted-foreground">
                {weekdays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
                {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
                  <span
                    key={day}
                    className={`rounded py-0.5 text-[11px] ${
                      day === 29
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground"
                    }`}
                  >
                    {day}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* recents */}
          <div className="mt-5 px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
              RECENTS
            </div>
            <ul className="mt-2 space-y-0.5">
              {recents.map((name, index) => (
                <li key={`${name}-${index}`}>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent/50">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* projects */}
          <div className="mt-5 px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
              PROJECTS
            </div>
            <button className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-sidebar-accent/50">
              <Plus className="h-3.5 w-3.5" />
              <span>No projects</span>
              <span className="ml-auto text-[11px]">Add one</span>
            </button>
          </div>
        </div>
          </>
        )}
      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
          </button>
          <span className="ml-1 truncate text-[13px] font-medium">Welcome to Skriuw.md</span>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => openSearchRef.current?.()}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Find in note (Ctrl/Cmd F)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Find</span>
              <kbd className="hidden rounded bg-[var(--muted)] px-1 text-[10px] sm:inline">⌘F</kbd>
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* editor */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <NoteEditor
            registerOpenSearch={(open) => {
              openSearchRef.current = open
            }}
          />
        </main>

        {/* status bar */}
        <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-4 text-[11px] text-muted-foreground">
          <span>257 words</span>
          <span>Block editor</span>
        </footer>
      </div>

      {/* inspector */}
      <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-sidebar px-4 py-4 lg:flex">
        <InspectorSection icon={<FileText className="h-3.5 w-3.5" />} title="OUTLINE" count={6}>
          <ul className="space-y-1.5 text-[13px]">
            <li className="text-sidebar-foreground">Welcome to Skriuw</li>
            <li className="pl-3 text-muted-foreground">Try this in the next two minutes</li>
            <li className="pl-3 text-muted-foreground">Block editor</li>
            <li className="pl-3 text-muted-foreground">Link notes</li>
            <li className="pl-3 text-muted-foreground">Tags</li>
            <li className="pl-3 text-muted-foreground">Handy shortcuts</li>
          </ul>
        </InspectorSection>

        <InspectorSection icon={<Hash className="h-3.5 w-3.5" />} title="TAGS" count={2}>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md border border-border px-2 py-0.5 text-[12px] text-sidebar-foreground">#getting-started</span>
            <span className="rounded-md border border-border px-2 py-0.5 text-[12px] text-sidebar-foreground">#tag</span>
          </div>
        </InspectorSection>

        <InspectorSection icon={<Link2 className="h-3.5 w-3.5" />} title="LINKS" count={3}>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">OUTGOING · 3</div>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li className="flex items-center gap-2 text-sidebar-foreground">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Skriuw handbook
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <Workflow className="h-3.5 w-3.5" />
              From idea to published note
            </li>
          </ul>
        </InspectorSection>

        <InspectorSection icon={<Settings className="h-3.5 w-3.5" />} title="DETAILS" count={9}>
          <dl className="space-y-1.5 text-[12px]">
            <DetailRow label="Created" value="30 days ago" />
            <DetailRow label="Modified" value="14 days ago" />
            <DetailRow label="File Size" value="1.4 KB" />
            <DetailRow label="Characters" value="1,436" />
            <DetailRow label="Words" value="257" />
            <DetailRow label="Read Time" value="2m" />
          </dl>
        </InspectorSection>
      </aside>

      {/* overlays */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onFind={() => openSearchRef.current?.()}
        onOpenSettings={() => setSettingsOpen(true)}
        onSearchWorkspace={() => setSidebarMode("search")}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function RailIcon({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {icon}
    </button>
  )
}

function InspectorSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
        {icon}
        {title}
        <span className="text-muted-foreground/70">({count})</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5" />
      </div>
      {children}
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-sidebar-foreground">{value}</dd>
    </div>
  )
}
