# Performance contract

This contract sets how quickly Skriuw must respond to each interaction, the rules the code follows to meet those times, and how both are measured. It is binding: an architecture change that misses a budget does not merge without a recorded decision and a new measurement.

## Meaning of instant

Instant means same-frame feedback with no visible intermediate loading state: the response to a click or key press is drawn in the next frame, with no spinner, placeholder, or half-loaded view in between. Physics prevents literal zero duration, so the rule is about structure instead. Architecture must remove asynchronous dependencies from interaction paths: the code that runs between an interaction and its response never waits on something that finishes later, such as the disk, the network, or a reply from the Rust core.

## Terms

- **Frame**: one image the screen draws. At 60 frames per second a new frame is due every 16.67 ms, so 16.67 ms is the longest an interaction can take and still appear in the next frame. The 8 ms targets are about half a frame.
- **Dropped frame**: a frame the screen skipped because work was still running. The benchmark harness counts one whenever the gap between two drawn frames is more than one and a half times the normal frame time.
- **P50, P95, P99**: percentiles over many repeated measurements of the same interaction. P95 below 8 ms means at least 95 of every 100 measurements finished in under 8 ms. P50 is the middle value and P99 covers 99 of every 100.
- **Max**: the single slowest measurement. A max budget holds for every run, not most of them.
- **Main thread**: the one thread that runs the interface's code and draws the screen. While it is busy, nothing on screen can change.
- **Task, long task**: a task is one uninterrupted block of work on the main thread, such as handling a key press. The browser reports a long task when one runs longer than 50 ms.
- **Long animation frame (LoAF)**: a browser report of a frame that took longer than 50 ms to produce, naming the scripts that held it up.
- **Async boundary**: a point where code stops and waits for something to finish later, such as a disk read or a reply from another process.
- **IPC**: inter-process communication, here a message between the interface (the web view) and Skriuw's Rust core. Benchmark records call these bridge calls.
- **Editor state**: the editor's in-memory copy of one note: its document, selection, and undo history. A cached note is one whose editor state is still in memory from a recent visit.
- **Working set**: the editor states kept in memory. Dropping one is called eviction, and opening an evicted note is a cold revisit, because its editor state has to be rebuilt.
- **Render, commit**: rendering is React running a component's code to work out what it should show. A commit is React applying one round of rendering to the page.
- **Mount, remount**: mounting creates a component and its part of the page. Remounting throws it away and creates it again, which costs time and loses whatever it held.
- **Editor host**: the component that holds the editor on the page.
- **Store, subscription, selector**: the store is the app's shared in-memory state. A component subscribes to be told when it changes, and a selector picks out the exact value the component shows, so the component re-renders only when that value changes.
- **Consumer**: a component that reads a particular value from the store.
- **NodeView**: the code that draws one embedded object inside the editor, such as a diagram, separately from the text around it.
- **Transaction**: one change to a note's document, saved and undone as a unit.
- **Projection**: data derived from the notes that can be rebuilt from them at any time, such as the search index and the version history.
- **Fixture**: a generated test workspace of a fixed size, so every benchmark run measures the same work.
- **Invariant**: a rule that must hold every time, independent of how fast the machine is.
- **Production build**: the optimised build of the app that ships, as opposed to the slower development build.
- **Reference hardware**: the one fixed machine whose timings count as the official result, so runs can be compared.

## Budgets

Reference hardware will be fixed before implementation benchmarks begin.

| Interaction | Target | In plain terms |
| --- | --- | --- |
| Note selection feedback | Same event task; no async boundary | The selected note highlights within the same task that handles the click or key press, without waiting on anything. |
| Cached editor-state swap | P95 below 8 ms; max below 16.67 ms | Showing a recently visited note again: 95 of 100 swaps take under half a frame and none takes longer than one frame. |
| Command palette open | P95 below 8 ms | 95 of 100 opens take under half a frame. |
| Tree create, move, reorder | P95 below 8 ms | Adding, moving, or reordering an item in the sidebar tree: 95 of 100 take under half a frame. |
| Keystroke to paint | P95 below 8 ms; max below 16.67 ms | The time from pressing a key until the result is on screen. |
| Diagram node drag frame | Max below 16.67 ms | Every frame of dragging a flowchart node is ready within one frame. |
| Main-thread task during navigation | None above 8 ms | While you move between notes, no single task keeps the main thread busy for more than half a frame. |
| Dropped frames during 100 cached note switches | Zero on reference hardware | Switching between recently visited notes 100 times in a row never skips a frame. |

## Hard invariants

These rules hold regardless of timing. Each one removes a kind of work from the paths you use most.

- No IPC during note navigation: opening another note sends nothing to the Rust core and waits for no reply.
- No database read during note navigation: the note is already in memory, so SQLite is not queried.
- No Markdown parse during note navigation: a note's text is not converted from Markdown into an editor document when you open it.
- No Git operation during editing or navigation: version history is written in the background, never while you type or switch notes.
- No route or editor chunk loading after startup: a chunk is a separately loaded piece of the app's code, and every screen's code and the editor's code are loaded when the app starts, never on demand later.
- No editor component remount during note navigation: the editor is created once, and switching notes swaps its content instead of rebuilding it.
- No post-startup skeleton for cached workspace content: once the app is running, content already in memory never shows a grey placeholder shape (a skeleton) while it loads.
- No application-shell render from editor keystrokes: typing re-renders the editor only, never the frame around the note (navigation rail, sidebar, tabs, and toolbars).
- No broad store subscription where a selector can express the dependency: a component asks the store for exactly the value it shows instead of being told about every change.
- No production React Scan or profiling instrumentation: React Scan, a development tool that highlights components as they re-render, and other profiling code are left out of the app that ships.
- Each visible editor retains at most 32 clean note states. Active, dirty, or in-flight note states may temporarily exceed that ceiling and must never be evicted. A clean state has no unsaved changes, a dirty one has unsaved edits, an in-flight one is being saved right now, and the active one is the note on screen.
- Diagram pointer movement stays renderer-local, routes only incident connectors, and produces one document transaction when the gesture ends: dragging a flowchart node is handled entirely in the interface, redraws only the lines attached to that node, and writes a single change to the note when you let go.
- Cached note navigation does not parse diagram source or run automatic layout: showing a recently visited note again does not reread its flowchart text or recalculate where its nodes go.

## Fixtures

The benchmarks run against these fixtures. A block is one paragraph, heading, list, code block, or similar unit of a note.

- 1,000 and 5,000-note workspaces.
- 50, 500, and 2,000-block documents.
- 100 rapid note switches by keyboard.
- 10,000 command-palette entries.
- Continuous typing while search and history projections update.
- At least 100 distinct note visits followed by a cold revisit, with working-set size and reconstruction timing recorded. Reconstruction timing is how long the evicted note's editor state takes to rebuild.
- Mixed prose with 10-, 50-, and 150-node editable flowcharts.

## Enforcement

Performance marks surround selection dispatch, editor-state installation, command opening, keystroke handling, and next paint. A performance mark is a timestamp the code records through the browser's Performance API, so each step is timed from the moment a note is selected, through putting its editor state in place, to the next frame on screen. Long Animation Frame observations capture blocking work. React profiling records commits and affected component names. React Scan exposes avoidable renders during development but is not treated as proof of performance.

The benchmark harness runs a production build on fixed reference hardware. It stores raw samples, P50, P95, P99, maximum duration, dropped frames, long tasks, React commit counts, and editor-host mount counts. Raw samples are every individual timing, kept next to the summaries so a result can be checked later, and the editor-host mount count shows whether the editor was rebuilt. CI uses a stable dedicated performance runner; ordinary shared CI runs functional checks without pretending timing is deterministic. CI (continuous integration) is the set of automated checks that runs on every proposed change. Its shared machines check that things work but do not judge timing, because their speed varies from run to run.

Architecture changes failing budgets do not merge without an explicit ADR and a replacement measurement. An ADR (architecture decision record) is a short document in [`docs/adr`](adr) that records a design decision and the reasons for it.

## Render invariants

Each interaction may re-render only the parts of the interface listed here.

| Interaction | Allowed React work | In plain terms |
| --- | --- | --- |
| Editor keystroke | Editor-owned view only | Typing re-renders the editor and nothing else. |
| Diagram drag | Diagram NodeView only; one editor transaction at gesture end | Dragging a node re-renders only that diagram and saves one change when you let go. |
| Note selection | Selected-note consumers only; editor host stays mounted | Opening a note re-renders only what shows the selected note, and the editor is not rebuilt. |
| Tree selection | Previous row, next row, and direct selection consumers | Moving the selection in the sidebar re-renders the row it left, the row it lands on, and what reads the selection directly. |
| Metadata edit | Changed field consumers only | Editing a property re-renders only what shows that property. |
| Command palette query | Palette result surface only | Typing in the command palette re-renders only its result list. |

Component counts are finalized after the UI decomposition exists. Any component rendering identical output is a regression regardless of whether the frame budget still passes. In plain terms, the exact number of components allowed to re-render per interaction is set once the interface is split into its final components, and a component that re-renders only to produce the same output as before counts as a step backwards even when the interaction still fits its time budget.
