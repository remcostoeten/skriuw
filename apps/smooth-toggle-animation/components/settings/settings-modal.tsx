"use client"

import { useEffect, useRef, useState } from "react"
import {
  Database,
  Eye,
  FlaskConical,
  Keyboard,
  Palette,
  PenLine,
  Shield,
  Sparkles,
  Tag,
  User,
  X,
} from "lucide-react"
import { AccountSection } from "./sections/account"
import { AppearanceSection } from "./sections/appearance"
import { EditorSection } from "./sections/editor"
import { ShortcutsSection } from "./sections/shortcuts"
import { DataSyncSection } from "./sections/data-sync"
import { PrivacySection } from "./sections/privacy"
import { SecuritySection } from "./sections/security"
import { AiSection } from "./sections/ai"
import { TagsSection } from "./sections/tags"
import { ExperimentalSection } from "./sections/experimental"

export type SettingsTabId =
  | "account"
  | "appearance"
  | "editor"
  | "shortcuts"
  | "data"
  | "privacy"
  | "security"
  | "ai"
  | "tags"
  | "experimental"

type SettingsGroup = "Account" | "Workspace" | "Intelligence" | "Advanced"

const GROUP_ORDER: SettingsGroup[] = ["Account", "Workspace", "Intelligence", "Advanced"]

const SECTIONS: Array<{
  id: SettingsTabId
  label: string
  icon: React.ReactNode
  description: string
  group: SettingsGroup
}> = [
  { id: "account", label: "Account", icon: <User className="h-4 w-4" />, description: "Profile and sign-in", group: "Account" },
  { id: "security", label: "Security", icon: <Shield className="h-4 w-4" />, description: "Password and sessions", group: "Account" },
  { id: "privacy", label: "Privacy", icon: <Eye className="h-4 w-4" />, description: "Analytics and data use", group: "Account" },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" />, description: "Theme and density", group: "Workspace" },
  { id: "editor", label: "Editor", icon: <PenLine className="h-4 w-4" />, description: "Writing experience", group: "Workspace" },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard className="h-4 w-4" />, description: "Keyboard bindings", group: "Workspace" },
  { id: "tags", label: "Tags", icon: <Tag className="h-4 w-4" />, description: "Manage tags", group: "Workspace" },
  { id: "ai", label: "AI", icon: <Sparkles className="h-4 w-4" />, description: "Providers and keys", group: "Intelligence" },
  { id: "data", label: "Data & sync", icon: <Database className="h-4 w-4" />, description: "Export and backup", group: "Advanced" },
  { id: "experimental", label: "Experimental", icon: <FlaskConical className="h-4 w-4" />, description: "Preview features", group: "Advanced" },
]

export function SettingsModal({
  open,
  onClose,
  initialTab = "account",
}: {
  open: boolean
  onClose: () => void
  initialTab?: SettingsTabId
}) {
  const [tab, setTab] = useState<SettingsTabId>(initialTab)
  // Keep the modal mounted while the exit animation plays.
  const [mounted, setMounted] = useState(open)
  // Drives the enter/exit transition (false = off-screen/faded, true = settled).
  const [visible, setVisible] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  // Mount immediately on open, then flip `visible` on the next frame so the
  // browser can transition from the initial (hidden) state. On close, play the
  // exit transition first, then unmount after it finishes (500ms drawer curve).
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const timeout = setTimeout(() => setMounted(false), 500)
    return () => clearTimeout(timeout)
  }, [open])

  // Lock background scroll while the modal is on screen.
  useEffect(() => {
    if (!mounted) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [mounted])

  // Accessibility: move focus into the dialog on open, mark the rest of the app
  // `inert` so it's hidden from AT / not focusable, and restore focus on close.
  // Keyed off `mounted` so the panel/root refs exist when this runs.
  useEffect(() => {
    if (!open || !mounted) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const container = rootRef.current
    const backgrounded: Element[] = []
    if (container?.parentElement) {
      for (const sibling of Array.from(container.parentElement.children)) {
        if (sibling !== container && !sibling.hasAttribute("inert")) {
          sibling.setAttribute("inert", "")
          backgrounded.push(sibling)
        }
      }
    }

    // Focus the panel itself so screen readers announce the dialog.
    panelRef.current?.focus()

    return () => {
      backgrounded.forEach((el) => el.removeAttribute("inert"))
      previouslyFocused?.focus?.()
    }
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose()
        return
      }
      // Focus trap: keep Tab / Shift+Tab cycling within the dialog.
      if (e.key === "Tab") {
        const panel = panelRef.current
        if (!panel) return
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-8"
    >
      <button
        aria-label="Close settings"
        className={`absolute inset-0 cursor-default bg-black/60 backdrop-blur-[1px] transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:duration-300 motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        className={`relative flex max-h-[88vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl shadow-black/50 outline-none will-change-transform sm:h-full sm:max-h-[720px] sm:max-w-4xl sm:flex-row sm:rounded-xl transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:duration-300 motion-reduce:transition-none motion-reduce:transform-none ${
          visible
            ? "translate-y-0 sm:scale-100 sm:opacity-100"
            : "translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0"
        }`}
      >
        {/* mobile drag handle */}
        <div
          aria-hidden
          className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
        />
        {/* nav */}
        <nav
          aria-label="Settings sections"
          className="hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar py-3 sm:flex"
        >
          <div className="px-4 pb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </div>
          {GROUP_ORDER.map((group) => (
            <div key={group} className="mb-2">
              <div className="px-4 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                {group}
              </div>
              <ul className="flex flex-col gap-0.5 px-2">
                {SECTIONS.filter((section) => section.group === group).map((section) => (
                  <li key={section.id}>
                    <button
                      onClick={() => setTab(section.id)}
                      aria-current={tab === section.id ? "page" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                        tab === section.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <span className={tab === section.id ? "text-foreground" : "text-muted-foreground"}>
                        {section.icon}
                      </span>
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* mobile tab strip */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 sm:hidden">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setTab(section.id)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs ${
                tab === section.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="relative min-w-0 flex-1 overflow-y-auto px-6 pb-12 pt-6 sm:px-10 sm:pt-8">
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          {tab === "account" && <AccountSection />}
          {tab === "appearance" && <AppearanceSection />}
          {tab === "editor" && <EditorSection />}
          {tab === "shortcuts" && <ShortcutsSection />}
          {tab === "data" && <DataSyncSection />}
          {tab === "privacy" && <PrivacySection />}
          {tab === "security" && <SecuritySection />}
          {tab === "ai" && <AiSection />}
          {tab === "tags" && <TagsSection />}
          {tab === "experimental" && <ExperimentalSection />}
        </div>
      </div>
    </div>
  )
}
