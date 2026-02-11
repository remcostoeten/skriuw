# Master Overview

## Project Context & AI Guidelines for Fixing Issues

### 🚀 Tech Stack & Core Architecture
- **Runtime**: Bun 1.3.3
- **Framework**: Next.js 16 (App Router) + Tauri 2.0
- **Database**: PostgreSQL (Neon/Local) with Drizzle ORM (`packages/db`)
- **State Management**: TanStack Query (Server State), Zustand (Client State)
- **Styling**: Tailwind CSS v4 + `@skriuw/ui`

### 🛡️ Critical Rules for AI Agents
1. **Data Access**: NEVER access the database directly in UI components. Always use `@skriuw/crud` hooks or server actions.
2. **Tenant Scoping**: All queries for user data (notes, folders, tasks) MUST be scoped by `userId`.
3. **State Handling**: Do NOT implement manual loading `useState`. Use TanStack Query's `isPending`/`error`.
4. **Feature Structure**: Place code in `apps/web/features/<feature-name>`. Use `@/features/...` imports.
5. **UI Consistency**: Use existing components from `@skriuw/ui` and tokens from `globals.css`.

### ⚡ Common Commands
- `bun run dev` - Start development server
- `bun run dbpush` - Push schema changes (Dev only)
- `bun run check-types` - Validate TypeScript
- `bun run lint` - Run ESLint

---

This document contains feature requests and bug fixes for the Next.js 16 + Tauri (macOS, Windows, Linux) note-taking app Skriuw.  
The app is conceptually similar to Notion, with editors, splits, tasks, templates, and a sidebar-driven workflow.

Each section below is a standalone issue or task.  
Sections are separated by dividers so they can be copied individually if needed.

────────────────────────────  
## Issue 1: Split View Does Not Sync Content

Problem  
Splitting the editor duplicates nodes into a left and right pane, but edits made in one pane are not reflected in the other. This makes split view mostly useless.

Additionally:
- Tabs are not duplicated across splits
- Each split behaves like an independent editor instance

Expected Behavior  
- Both panes must reflect the same underlying document state
- Editing on one side should instantly update the other
- Open tabs should be mirrored between splits
- Split view should be multiple perspectives of the same data, not cloned documents

Notes  
There may be multiple edge cases depending on how tabs and splits combine, but shared state is the core requirement.

────────────────────────────  
## Issue 2: Split Focus Cycling via Keyboard

Problem  
Navigating between splits is not intuitive. Focus cycling currently includes files instead of just active splits.

Requested Behavior  
- Cmd or Ctrl + Space cycles focus between active splits only
- Cycle order should be clockwise (left to right)
- If more than two splits exist, continue cycling clockwise
- Do not include inactive files
- Optional: Cmd or Ctrl + Shift + Space cycles in reverse

This should feel similar to pane navigation in modern IDEs.

────────────────────────────  
## Issue 3: Resize Split Panes via Keyboard

Current State  
Split panes can be resized using the mouse only.

Requested Feature  
Add keyboard resizing:
- Cmd + [ decreases the focused pane width
- Cmd + ] increases the focused pane width

Behavior  
- Resize in steps of roughly 5 percent
- Example: 50/50 → 55/45 → 60/40
- Minimum pane size is 5 percent
- Resizing applies relative to the currently focused pane

────────────────────────────  
## Issue 4: Missing Authentication UI

Problem  
Authentication logic exists, but there is no visible login or register UI.

Request  
Reuse or copy the authentication UI from the ZEMTGF project.  
This is primarily a UI wiring task, backend already exists.

────────────────────────────  
## Issue 5: Sidebar Pin UX Is Bad

Problems  
- Pin icon is visually unpleasant and unintuitive
- Pinned items do not stand out clearly
- Checkbox appears on the left when active, which feels inconsistent
- Pinned items should always be at position one

Requested Changes  
- Remove or redesign the pin icon
- Use checkbox state or layout positioning as the primary pinned indicator
- Ensure pinned items always appear at the top
- If an item supports pinning, this should be clearly indicated in the page itself

────────────────────────────  
## Issue 6: Task Creation via Slash Menu Is Broken

Current Behavior  
Using the slash menu to create a task:
- Shows a checkbox
- Focuses the task label input
- Allows naming the task

However:
- Task creation does not actually persist
- Opening the task panel results in “task not found”
- The panel opens, but the task entity does not exist

Expected Behavior  
- Tasks must be fully created when added via the editor
- Opening a task should always resolve to a valid task entity
- Task title and description editor must be correctly linked

────────────────────────────  
## Issue 7: Templates Are Forced and Cannot Be Disabled

Problem  
Templates (e.g. Cosmos, Python) always trigger an info-collection block with options like tags.  
There is currently no way to disable this.

Requested Feature  
- Add template modes in Preferences:
  - Full template
  - Plain note (no template)
- Allow users who want simple notes to completely disable templates
- Template selection should live in Preferences, not be mandatory per note

────────────────────────────  
## Issue 8: Configurable Editor Placeholder

Current State  
Editor placeholder text is fixed:
“Enter text, type / for commands”

Requested Feature  
- Allow users to configure their own placeholder text
- Placeholder configuration should live in the same Preferences area as templates
- This allows custom workflows or personal writing styles

────────────────────────────  
## Issue 9: Preferences Dialog Is Incomplete for Templates and Export

Problems  
- Closing a template file from the settings dialog is insufficient
- There is no clarity on what exported output looks like

Requested Improvements  
- Clearly define export formats and output structure
- Improve template management UX inside Preferences
- Make it obvious what is enabled, disabled, or active

────────────────────────────  
## Issue 10: Context Menu Typos and Broken Move Submenu

Problems  
- Context menu contains spelling mistakes
- The “Move” option opens a secondary popup menu
- Submenu text is misspelled
- The submenu feels unfinished and broken

Requested Fix  
- Spell-check all context menu entries
- Fix spelling in the Move submenu
- Ensure secondary popups render cleanly and consistently

────────────────────────────  
## Issue 11: Top Bar Toggle Popover Z-Index Bug

Problem  
The top bar contains a toggle button that opens the help sidebar.  
On hover, a popover appears, but:

- The z-index is incorrect
- The popover renders underneath the sidebar
- This makes the popover partially or fully hidden

Requested Fix  
- Correct z-index stacking so the popover always appears above sidebars and panels

────────────────────────────  
## Issue 12: Note Navigation Causes Loading Flicker

Problem  
When navigating between notes:
- URL changes (expected, not using SDM)
- A loading indicator briefly flashes
- This happens even when switching between already-loaded notes

Impact  
- Feels slow and visually noisy
- Breaks perceived instant navigation

Requested Behavior  
- Switching between notes should be instant
- Loading indicators should not flash for in-memory or cached entities
- This applies to notes, forms, and all similar entities

────────────────────────────  
## Issue 13: Future Feature Concept – Issue Tracking and Calendar

Concept  
Introduce lightweight issue tracking per unit or entity:
- Track seen issues per page or feature
- Mark issues with simple states (e.g. F, E)

Calendar  
- Default calendar view should be monthly
- Calendar should be copyable and extensible
- This serves as the base for future calendar features

Status  
Conceptual for now, not fully specified.
