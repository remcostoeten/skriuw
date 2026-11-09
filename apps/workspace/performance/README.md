# Product renderer performance harness

Measures the production workspace renderer against [the performance contract](../../../docs/performance-contract.md). It builds `performance/` with Vite, serves it with `vite preview`, opens it in a real browser, and drives trusted keyboard, mouse and wheel input. The page mounts `<App>` on a store hydrated from a deterministic fixture, with `@tauri-apps/api/core` replaced by `bridge-mock.ts`, so every bridge call the renderer makes is recorded.

```bash
node apps/workspace/performance/run.mjs
node apps/workspace/performance/run.mjs --browser webkit --context wide-1000/50
node apps/workspace/performance/run.mjs --content plain --output docs/benchmarks/raw/<name>.json
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--browser chrome\|webkit` | `chrome` | Chrome over the DevTools protocol, or the system WebKitGTK over WebKitWebDriver |
| `--content varied\|plain` | `varied` | Fixture content version, see below |
| `--context <fixture>/<blocks>` | all four | Repeatable or comma separated, for example `wide-1000/50,wide-5000/2000` |
| `--headed` | off | Show the browser window instead of running headless or on Xvfb |
| `--output <path>` | `performance/results/latest.json` | Raw samples, summaries, budgets and correctness checks |

The default contexts are `wide-1000/50`, `wide-1000/150`, `wide-5000/500` and `wide-5000/2000`. The 150-block document sits between 100 and the bounded window threshold of 192 blocks (`features/editor/document/bounded.ts`), so it renders the whole note with no progressive window.

The run exits 1 when a budget or a correctness check fails. Results are written before it exits. Timings only count from the reference machine named in the contract; runs on a loaded or different machine show whether the harness works, not whether a budget holds.

## Fixtures

The tree comes from the `skriuw-fixtures` projections (see [docs/fixtures.md](../../../docs/fixtures.md)). `fixture.ts` adds documents, references and history on top. Eight notes are measured: they hold the requested number of blocks.

`--content plain` is content version 1, the content used by every benchmark before 2026-11-09. The measured notes hold uniform paragraphs, the first with one link. Every other note is empty. Each note references one tag, one person and the next note. Search returns no hits. There are no history headers, annotations, tasks or journal.

`--content varied` is content version 2:

- Measured notes cycle through a 20-block pattern: an H2 and an H3, rich paragraphs, a bullet list, an ordered list, a task list with two items linked to workspace tasks, and a quote. A 72-line TypeScript code block (about 2.5 KB) appears every 40 blocks. Every top-level block's text starts with `Block N in measured note M`, and block 1 keeps the link the link-caret phase needs.
- Rich paragraphs carry bold, italic and inline code, `#` tag references, `@` note references, person references, external links, highlights and annotation marks. Each annotation mark has a matching annotation thread with one comment.
- Every other note holds 5 to 10 blocks of the same content, with a 40-line code block in every tenth note. The average document is about 4 KB of JSON; the record reports `fixture.averageDocumentJsonBytes`.
- Tag references concentrate on 40 tags, so the busiest tags have dozens of notes (`fixture.largestTagFanOut`).
- Every note has 2 to 7 history headers.
- A `Journal` folder holds 120 daily entries with date properties, and a mood on every third entry.
- About a third of the unmeasured notes mention a measured note's title in plain text. `search_workspace` answers with the notes that contain the queried title, so the unlinked-mentions section converts real candidate documents after each note switch.

Both versions are pure functions of the projection, block count and content version. `fixture.contentVersion` is recorded in every result.

## Phases

The original phases run first, in the same order and with the same pacing as before, and keep their budgets: 100 cached switches by `setActiveNote`, 100 distinct visits and a cold revisit, 100 keyboard switches in the tree, the navigation tail, 30 typed keys, link caret moves and reference suggestion queries. The navigation tail now also reports its longest frame gap, long tasks, Long Animation Frames, and the unlinked-mention rows it rendered.

The page binds the product's own UI persistence (`bindUiPersistence` from `src/app/ui-persistence.ts`), so pane layout and sidebar expansion saves show up as bridge calls where the product makes them.

The scenarios below run after those phases, under a second Chrome trace with the `toplevel` and `blink.user_timing` categories. They are informational: none has a budget yet.

| Scenario | What it does | What it reports |
| --- | --- | --- |
| `savePause` | Types 12 keys, waits for the debounced save to reach `apply_workspace_operations`, three times | Delay from the last key to the save, the frame gap around the save, the main-thread task that ran it |
| `pendingSaveSwitch` | Types 5 keys, waits 150 ms so the save is still pending, clicks the next measured note in the tree, ten times | Click to next paint, mouse press to paint, saves sent per switch, click dispatch time |
| `bubbleHold` | Selects 8 characters with Shift+ArrowRight, waits for the formatting bubble menu, holds the selection for 2 s | Time to open, frame gaps and React commits during the hold |
| `sidebarCollapse`, `sidebarExpand` | Clicks the sidebar toggle and records 600 ms of frames | Frame gaps during the 260 ms track animation |
| `scroll` | Sends 60 wheel ticks of 200 px over the editor, one per frame | Frame gaps, bounded window `updateState` time, blocks rendered at the end |

Every scenario also reports long tasks, Long Animation Frames, React commits and bridge calls. With a trace, each scenario window adds its longest main-thread task, busy time, and the number of tasks over 8 ms and over 16.67 ms. The scenarios have their own correctness checks: saves happen, switches land on the clicked note, the bubble menu opens, the sidebar toggles both ways, the editor stays mounted and no resource loads.

## WebKit

Tauri ships on WebKitGTK on Linux, so `--browser webkit` drives the installed WebKitGTK 4.1 MiniBrowser through `WebKitWebDriver`, on a private Xvfb display unless `--headed` is set. On Arch the binaries come from the `webkit2gtk-4.1` package, and `xorg-server-xvfb` provides Xvfb. `WEBKIT_WEBDRIVER` and `WEBKIT_BROWSER` override the binary paths. Playwright's WebKit build was not used: on Arch it needs Ubuntu's ICU 74, libjxl 0.8 and libbacktrace, and it is a different build from the WebKitGTK that ships with the app.

WebKitGTK lacks some of what Chrome provides, so these are N/A there:

| Metric | Why | Effect |
| --- | --- | --- |
| `navigationMainThreadTask` budget, keydown trace, idle callback trace, scenario task attribution, save task duration | No tracing over WebDriver | Budget reports N/A, `trace` and `scenarios.trace` are `null` |
| `noBlockingAnimationFrames` budget and every `longAnimationFrames` list | No Long Animation Frame API | Budget reports N/A, lists stay empty |
| `longTasks` | No Long Tasks API | Lists stay empty |
| `startupPreparation.heapBytes*` | No `performance.memory` | `null` |
| Navigation tail idle wait | No `requestIdleCallback` | Waits 50 ms instead, `idleCallbackFallback` is `true` |
| Console errors | WebDriver exposes no console | The page records `console.error`, `error` and `unhandledrejection` itself |
| Native wheel scrolling | WebKitGTK's WebDriver wheel action fires a trusted `wheel` event but does not scroll | The scroll scenario calls `scrollBy` on the editor once per frame instead, and records `input: "scrollBy"` |

Frame gaps, keystroke to paint, dispatch timing, editor swap timing, React commits, bridge calls and every correctness check work in both browsers. Xvfb has no vsync, so WebKit frame timing on Xvfb follows WebKit's own 60 Hz timer.
