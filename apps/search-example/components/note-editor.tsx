"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/mantine"
import type { PartialBlock } from "@blocknote/core"
import "@blocknote/core/fonts/inter.css"
import "@blocknote/mantine/style.css"

import {
  buildRegex,
  createSearchPlugin,
  defaultSearchOptions,
  getSearchState,
  nextMatch,
  previousMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
  type SearchOptions,
} from "@/lib/search-plugin"
import { SearchWidget } from "@/components/search-widget"

const initialContent: PartialBlock[] = [
  { type: "heading", props: { level: 1 }, content: "Welcome to Skriuw" },
  {
    type: "paragraph",
    content:
      "Skriuw is a notes workspace that stays out of your way — scratchpad, journal, or linked knowledge base. This note is tagged #getting-started. The companion note Skriuw handbook goes deeper.",
  },
  { type: "heading", props: { level: 2 }, content: "Try this in the next two minutes" },
  { type: "paragraph", content: "Press Ctrl/Cmd F to open search, then type a word to find it." },
  { type: "paragraph", content: "Toggle Match Case, Match Whole Word, and Use Regular Expression just like in VS Code." },
  { type: "paragraph", content: "Expand the panel with the chevron to find and replace, or replace all matches at once." },
  { type: "heading", props: { level: 2 }, content: "Block editor" },
  {
    type: "paragraph",
    content:
      "Each paragraph is a block. Hover the handle to reorder. The slash menu gives you headings, lists, quotes, code, tables, and more.",
  },
  { type: "bulletListItem", content: "Type markdown inline — ## becomes a heading, [ ] becomes a checkbox." },
  { type: "bulletListItem", content: "Switch to raw MDX in the toolbar when you want a source view." },
  { type: "bulletListItem", content: "Insert a file tree block with /file tree for a live example." },
  { type: "heading", props: { level: 2 }, content: "Link notes" },
  {
    type: "paragraph",
    content:
      "Type [[ Note title ]] to link another note. Unresolved links can be clicked to create the target note. Open the Skriuw handbook for a worked example with backlinks.",
  },
  { type: "heading", props: { level: 2 }, content: "Tags" },
  {
    type: "paragraph",
    content:
      "Add tags inline with #tag or the /tag slash command. Tags show up in the inspector and can be clicked to filter the workspace.",
  },
  { type: "heading", props: { level: 2 }, content: "Handy shortcuts" },
  { type: "paragraph", content: "N new note · Cmd/Ctrl K command palette · Cmd/Ctrl \\ toggle sidebar · Cmd/Ctrl F find in note." },
  { type: "paragraph", content: "Everything else lives in the Skriuw handbook. For a longer example of linked notes in folders, open From idea to published note." },
]

export type NoteEditorHandle = {
  openSearch: () => void
}

export function NoteEditor({
  registerOpenSearch,
}: {
  registerOpenSearch?: (open: () => void) => void
}) {
  const editor = useCreateBlockNote({ initialContent })
  const searchPlugin = useMemo(() => createSearchPlugin(), [])

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [replaceValue, setReplaceValue] = useState("")
  const [showReplace, setShowReplace] = useState(false)
  const [options, setOptions] = useState<SearchOptions>({ ...defaultSearchOptions })
  const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 })

  const findInputRef = useRef<HTMLInputElement>(null)

  const regexError = useMemo(() => {
    if (!options.regex || query.length === 0) return false
    return buildRegex(query, options) === null
  }, [options, query])

  // Register the ProseMirror search plugin once the editor exists.
  useEffect(() => {
    const tiptap = editor._tiptapEditor
    if (!tiptap) return
    tiptap.registerPlugin(searchPlugin)
    return () => {
      tiptap.unregisterPlugin(searchPlugin.spec.key!)
    }
  }, [editor, searchPlugin])

  const syncMatchInfo = useCallback(() => {
    const view = editor.prosemirrorView
    const state = view ? getSearchState(view) : undefined
    setMatchInfo({ current: state?.current ?? 0, total: state?.matches.length ?? 0 })
  }, [editor])

  // Re-run the search whenever the query or options change.
  useEffect(() => {
    const view = editor.prosemirrorView
    if (!view) return
    setSearch(view, query, options)
    syncMatchInfo()
  }, [editor, query, options, syncMatchInfo])

  const openSearch = useCallback(() => {
    setOpen(true)
    // Defer so the input is mounted before focusing.
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [])

  const closeSearch = useCallback(() => {
    setOpen(false)
    const view = editor.prosemirrorView
    if (view) {
      setSearch(view, "", options)
      view.focus()
    }
  }, [editor, options])

  useEffect(() => {
    registerOpenSearch?.(openSearch)
  }, [registerOpenSearch, openSearch])

  // Global Cmd/Ctrl+F handler.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        openSearch()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [openSearch])

  const handleNext = useCallback(() => {
    const view = editor.prosemirrorView
    if (!view) return
    nextMatch(view)
    syncMatchInfo()
  }, [editor, syncMatchInfo])

  const handlePrevious = useCallback(() => {
    const view = editor.prosemirrorView
    if (!view) return
    previousMatch(view)
    syncMatchInfo()
  }, [editor, syncMatchInfo])

  const handleReplaceCurrent = useCallback(() => {
    const view = editor.prosemirrorView
    if (!view) return
    replaceCurrent(view, replaceValue)
    syncMatchInfo()
  }, [editor, replaceValue, syncMatchInfo])

  const handleReplaceAll = useCallback(() => {
    const view = editor.prosemirrorView
    if (!view) return
    replaceAll(view, replaceValue)
    syncMatchInfo()
  }, [editor, replaceValue, syncMatchInfo])

  const toggleOption = useCallback((key: keyof SearchOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Alt+C / Alt+W / Alt+R shortcuts while the widget is open.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "c") {
        event.preventDefault()
        toggleOption("caseSensitive")
      } else if (key === "w") {
        event.preventDefault()
        toggleOption("wholeWord")
      } else if (key === "r") {
        event.preventDefault()
        toggleOption("regex")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, toggleOption])

  return (
    <div className="relative h-full">
      {open && (
        <div className="absolute right-4 top-3 z-30">
          <SearchWidget
            ref={findInputRef}
            query={query}
            onQueryChange={setQuery}
            replaceValue={replaceValue}
            onReplaceChange={setReplaceValue}
            showReplace={showReplace}
            onToggleReplace={() => setShowReplace((value) => !value)}
            options={options}
            onToggleOption={toggleOption}
            current={matchInfo.current}
            total={matchInfo.total}
            regexError={regexError}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onClose={closeSearch}
            onReplaceCurrent={handleReplaceCurrent}
            onReplaceAll={handleReplaceAll}
          />
        </div>
      )}

      <div className="skriuw-editor mx-auto max-w-3xl px-6 pt-10 pb-32">
        <BlockNoteView editor={editor} theme="dark" />
      </div>
    </div>
  )
}
