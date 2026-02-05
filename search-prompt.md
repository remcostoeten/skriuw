# Feature Implementation: Global Command Palette & Unified Search

## 1. Deep Dive Architecture Audit
-   **Current State**: Search is fragmented. `note-mention-search.ts` exists but is limited. `useNotesQuery` loads all notes, enabling powerful client-side search.
-   **Gap**: Missing "Power User" features (Regex, Case Sensitivity, Exclusions) and "Mobile First" UX.
-   **Opportunity**: We can reuse the `fuzzyScore` logic but must implement it in a **Web Worker** or use `useDeferredValue` to ensure 60fps UI, especially with regex overhead.

## 2. Objective
Implement a **"VS Code-lite" Search Experience** that satisfies both casual users (fuzzy matching) and power users (regex, complex filters).

## 3. High-Level Requirements
1.  **Advanced Query Syntax**: Support `tag:work`, `created:>2024-01-01`, `!archive`, and Regex `/^Task/`.
2.  **Full Accessibility (a11y)**: Every toggle (Case, Regex, Word) must be accessible via keyboard shortcuts (e.g., `Alt+C`, `Alt+R`).
3.  **Mobile Excellence**: Bottom-sheet design on mobile, swipe-to-dismiss, haptic feedback.
4.  **Aesthetics**: Glassmorphism, layout animations, and syntax highlighting in the search input itself.

## 4. Detailed Implementation Specs

### A. The "Query Engine" Hook (`lib/search/use-advanced-search.ts`)
Implement a parser that transforms raw text into a structured query object.

**Parser Logic (`lib/search/query-parser.ts`)**:
-   **Patterns**:
    -   `tag:name` -> Filter by tag.
    -   `is:public|private|pinned` -> Boolean filters.
    -   `created:>DATE` or `updated:<DATE` -> Date range filters.
    -   `-term` -> Exclusion (NOT string).
    -   `*term` -> Glob/Wildcard matching.
-   **Modes**:
    -   **Regex**: If input is wrapped in `/.../` OR if "Use Regex" toggle is active.
    -   **Case**: Boolean flag for sensitive/insensitive.
    -   **Word**: Boolean flag for `\bword\b`.

**Scoring Algorithm Update**:
-   Must handle the complexity of Boolean logic + Fuzzy scoring.
-   * optimization*: Run date/tag filters *before* expansive fuzzy/regex matching.

### B. The UI Component (`features/search/GlobalCommandMenu.tsx`)
A rigorous, accessible interface.

**1. Input Area (The "Cockpit")**:
-   **Decorator**: Highlight syntax in the input (e.g., make `tag:` blue and the value bold).
-   **Toggles**:
    -   Right-aligned row of icons: `Aa` (Case), `ab` (Word), `.*` (Regex).
    -   **Tooltips**: Show keyboard shortcuts (`Alt+C`, etc.) on hover.
    -   **Focus Ring**: Distinct visual state when input is active vs when toggles are active.

**2. Results List**:
-   **Highlighted Matches**: If searching regex `/[0-9]/`, highlight the numbers in the result preview.
-   **Keyboard Nav**: `Up/Down` to list, `Tab` to cycle metadata/actions. `Enter` to open. `Cmd+Enter` to open in split view (if applicable).

**3. Mobile Experience (`MobileSearchDrawer.tsx`)**:
-   **Pattern**: Use a `Drawer` (Bottom Sheet) instead of a centered Modal on mobile.
-   **Gestures**:
    -   Swipe down to dismiss.
    -   Pull to refresh (re-index).
-   **Keyboard**: specialized virtual keyboard toolbar for quick access to `:`, `/`, `-`.
-   **Haptics**: Thin vibration on result selection.

### C. Accessibility (KBD & Screen Readers)
-   **ARIA Attributes**: `aria-expanded`, `aria-activedescendant`, `role="combobox"`.
-   **Global Shortcuts**:
    -   `Cmd+K`: Open.
    -   `Alt+R`: Toggle Regex.
    -   `Alt+C`: Toggle Case.
    -   `Alt+W`: Toggle Whole Word.
-   **Focus Trap**: Ensure tab focus stays within the modal/drawer while open.

## 5. Work Checklist
-   [ ] **Parser**: Implement `parseSearchQuery(input: string)` using a tokenizer approach (avoid brittle giant regexes).
-   [ ] **Worker**: Move the heavy `search(query, notes)` logic to a Web Worker (`search.worker.ts`) to prevent UI blocking during regex execution.
-   [ ] **UI**: Upgrade `GlobalCommandMenu` with the "Cockpit" header and Toggle buttons.
-   [ ] **Mobile**: Implement `MobileSearchDrawer` component with `vaul` (or equivalent drawer library) and conditional rendering based on viewport.
