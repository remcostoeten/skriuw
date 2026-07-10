# Product Tour — Spec & Script

Status: **built** (2026-07-10, `feat/onboarding`) — verified on web signed-in; desktop and
guest variants still need a live check. The old 4-step centered welcome modal
(`features/onboarding/`, store key `skriuw-onboarding`) and its `settings.welcomeTour`
command were **deleted** on 2026-07-10. This is a from-scratch replacement.

## Decisions (locked)

- **Hybrid** — spotlight real chrome (Act 1 & 3), cinematic canned demos for the
  writing features (Act 2). No step depends on real notes/data or user typing.
- **Comprehensive** — full 3-act, ~15 steps.
- **Auto for new users + relaunchable** — runs once on first `/app` visit (per-browser
  flag), relaunchable from the `?` menu, command palette, and settings.
- **Custom** — no tour library. Reuse framer-motion (already present) + theme tokens.

## Architecture

Rebuild `apps/web/src/features/onboarding/` (deleted 2026-07-10):

- `store.ts` — zustand + persist, localStorage key `skriuw-tour`. State:
  `hasSeenTour`, `hydrated`, `activeStep`, `startTour()`, `advance()`, `back()`,
  `dismissTour()`, `resetTour()`. `hydrated` gates first-paint flash (mirror the old
  pattern). Browser-scoped, **not** per-user.
- `tour-steps.tsx` — the declarative script (array below). Each step:
  `{ id, act, kind: "spotlight" | "demo" | "deeplink", anchor?, title, body, shortcut?,
predicate? }`. `predicate` filters by platform/capability at runtime.
- `components/product-tour.tsx` — overlay engine: query anchor via `data-tour`,
  `getBoundingClientRect` + `scrollIntoView`, dimmed SVG-mask cutout + rounded accent
  ring, positioned tooltip. Arrow/Esc/Tab nav (mirror the deleted walkthrough's key
  handling), `useReducedMotion`, focus trap, progress dots.
- `components/demos/*` — the Act 2 canned mini-animations (slash, tag, mention, person,
  backlinks, image). Each is a self-contained looping visual; no editor dependency.

Wiring:

- Add `data-tour="<id>"` anchors to shell elements (see anchor column below). Most
  already have stable `aria-label`s we can target instead; add `data-tour` only where none
  exists (icon-rail `<aside>`, sidebar, editor pane, tab bar, metadata panel).
- Mount `<ProductTour />` in `notes-layout-shell.tsx`, gated on
  `hydrated && !hasSeenTour` (dynamic import, `ssr:false`, like the old one).
- Re-add command `settings.productTour` in `core/commands/registry.ts` (group "Help")
  **with** a handler in `global-command-palette-mount.tsx` that calls `resetTour()` +
  `startTour()` (the old `settings.welcomeTour` was a dangling no-op — do not repeat that).
- Deep-link steps reuse existing surfaces: open command palette (command registry
  `isOpen`), open shortcut help (`notes.help` / `showShortcutHelp`), open Settings → AI
  (settings modal, section swaps via `isTauriRuntime()` at `settings-modal.tsx:252`).

## Platform / capability gating

Runtime switches already exist — no new plumbing:

- `isTauriRuntime()` (`core/workspace-backend/tauri-backend.ts`) → desktop vs web.
- `useWorkspaceCapabilities()` (`core/workspace-backend/context.tsx`) →
  `{ ai, sharing, collaboration, journal, trash, history, coverUpload }`.
- `useIsGuestWorkspace()` → guest (`mode === "local"`, nearly everything off).

| Step                                   | Web signed-in | Desktop | Guest                 |
| -------------------------------------- | ------------- | ------- | --------------------- |
| Cloud sync + real-time collab          | show          | skip    | → "sign in to unlock" |
| Local AI (Ollama install + model pull) | skip          | show    | skip                  |
| Cloud AI actions                       | show          | show    | → locked CTA          |
| Journal step (`cap journal`)           | show          | show    | skip                  |
| Settings deep-link step                | show          | show    | show                  |

Guest gets the trimmed tour ending on a "sign in to unlock sync, journal, AI, history" CTA.

## The script

Each Act-1/3 step shows a `<kbd>` shortcut chip pulled from `core/shortcuts/registry.ts`
(honoring the `desktopKeys` override, e.g. new-note = `⌘⇧O` web / `⌘N` desktop).

### Act 1 — Orientation (spotlight real UI)

| #   | id                          | anchor                                       | copy                                                                                          |
| --- | --------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `welcome`                   | centered card                                | "Skriuw is a local-first, keyboard-first notebook." — Start / Skip                            |
| 2   | `nav`                       | icon-rail `<aside>` (add `data-tour`)        | "Jump between Notes, Journal, Graph, Tags, and People."                                       |
| 3   | `journal` _(cap `journal`)_ | rail journal link (`a[href="/app/journal"]`) | "A page for every day — templates, `#`/`$` chips, feeds the graph, exports to your calendar." |
| 4   | `sidebar`                   | sidebar panel (add `data-tour`)              | "Your notes live here — nest them into folders and sections, drag to reorder."                |
| 5   | `new-note`                  | new-note button (`aria-label="New note"`)    | "Start a note." chip `⌘⇧O` / `⌘N`                                                             |
| 6   | `editor`                    | editor pane (add `data-tour`)                | "A block editor. Everything starts with a keystroke."                                         |

### Act 2 — The writing magic (cinematic demos, zero user action)

| #   | id         | demo                                                                                                     | copy                                                                                                |
| --- | ---------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 7   | `slash`    | auto-types `/`, menu opens, picks Code / Diagram / Toggle                                                | "Type `/` for blocks: code, Mermaid diagrams, toggles, AI, and more."                               |
| 8   | `tags`     | types `#ideas`, chip pops                                                                                | "Tag inline with `#`. Tags roll up into the Tags overview and the graph."                           |
| 9   | `mentions` | types `@Roadmap`, chip pops, then a backlinks list fills in (absorbed the old separate `backlinks` step) | "Link notes with `@` — creates the note if missing; every `@` becomes a backlink in the inspector." |
| 10  | `people`   | types `$Remco`, person chip                                                                              | "Mention people with `$`. Each gets a profile and a graph node."                                    |
| 11  | `images`   | sample image fades into body + gradient cover on the page header                                         | "Drag-drop or paste images; set a page cover. (Nothing to upload now — just showing you.)"          |

### Act 3 — Power tools

| #   | id                            | kind / anchor                            | copy                                                                                                            |
| --- | ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 12  | `palette`                     | spotlight, deep-link opens palette       | "Do anything from the command palette — fuzzy search + bangs `!n` `!s` `!a`." chip `⌘K`                         |
| 13  | `shortcuts`                   | deep-link opens shortcut help dialog     | "Skriuw is keyboard-first, and every shortcut is remappable in Settings." chip `⇧/`                             |
| 14  | `settings`                    | deep-link opens Settings (default tab)   | "Themes, editor behavior, keyboard remapping, quick access, data export — it all lives in Settings."            |
| 15  | `ai` _(cap `ai`)_             | spotlight AI dropdown / `Ask AI…`        | "Summarize, continue writing, extract tasks, suggest tags — right in the editor."                               |
| 16  | `local-ai` _(desktop only)_   | deep-link Settings → AI → Install Ollama | "On desktop, run models 100% locally — one-click install Ollama and pull a model. Nothing leaves your machine." |
| 17  | `sync` _(web signed-in only)_ | card                                     | "Signed in on the web, your notes sync to the cloud and you can collaborate in real time."                      |
| 18  | `finish`                      | centered card                            | "You're set. Replay this anytime from `?` or `⌘K → Product tour`." (subtle celebratory flourish)                |

Guest-only closer (replaces 16/17): "You're in guest mode — everything's saved locally in
your browser. Sign in to unlock sync, journal, AI, and history." → sign-in CTA.

## Aesthetics

- Dim backdrop via SVG mask cutout; rounded highlight ring using theme accent /
  `--project-*` tokens so it themes across all three themes.
- framer-motion spring on tooltip enter; progress dots; `useReducedMotion` honored.
- Shortcut keys rendered as `<kbd>` chips.

## Verification caveat

Anchor positioning / rAF-driven demos **cannot** be verified via Claude-in-Chrome
(hidden tab throttles rAF → 0). Needs a foreground browser for live check on both web and
the packaged desktop app (WebKitGTK — watch the CSS-zoom rect split noted in
`popover-misposition-css-zoom`).
