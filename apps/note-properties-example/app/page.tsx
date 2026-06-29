import { ChevronLeft, ChevronRight, PanelLeft, Sparkles } from "lucide-react"
import { NoteEditor } from "@/components/note-editor"

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Top chrome, mimicking the Skriuw editor toolbar */}
      <header className="sticky top-0 z-40 flex h-12 items-center gap-1 border-b border-border/60 bg-background/80 px-3 backdrop-blur">
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Toggle sidebar">
          <PanelLeft className="size-4" />
        </button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Back">
          <ChevronLeft className="size-4" />
        </button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Forward">
          <ChevronRight className="size-4" />
        </button>
        <span className="ml-1 truncate text-sm text-muted-foreground">Untitled.md</span>
        <button
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
          aria-label="Assistant"
        >
          <Sparkles className="size-4" />
        </button>
      </header>

      <NoteEditor />
    </main>
  )
}
