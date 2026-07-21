# Fresh Codex session prompt

Copy everything below into a new Codex session.

```text
Continue Skriuw Standalone as the primary implementation agent.

Repository:
- Work only in /home/remcostoeten/dev/skriuw-standalone.
- Stay on feat/instant-local-first-foundation.
- Verified implementation/handoff baseline: 8c1abff.
- This prompt file may be committed on top of that baseline.
- No Git remote exists. Do not claim anything is pushed.
- Do not edit, merge, reset, or delete any skriuw-claude-* or skriuw-fable-tree worktree.

Communication:
- Be concise and concrete.
- Continue autonomously while safe work remains.
- Give progress updates at meaningful checkpoints and at least once per minute during long work.
- Lead the final response with what was completed, verification, commits, and the immediate next task.

Mandatory start:
1. Run:
   cd /home/remcostoeten/dev/skriuw-standalone
   git status --short
   git branch --show-current
   git log --oneline --decorate -15
   git worktree list --porcelain
2. Stop if the primary worktree is dirty or the branch is wrong. Preserve all user changes.
3. Read completely, in order:
   - AGENTS.md
   - TODO.md
   - docs/handoff.md
   - ARCHITECTURE.md
   - docs/roadmap.md
   - docs/performance-contract.md
   - docs/fixtures.md
   - docs/adr/0004-defer-ui-editor.md
   - docs/adr/0016-deterministic-scale-fixtures.md
   - spikes/tree-virtualization/README.md
   - docs/benchmarks/2026-07-21-tree-virtualization.md
   - spikes/tree-virtualization/src/types.ts
   - spikes/tree-virtualization/src/tree.ts
   - spikes/tree-virtualization/src/view.ts
   - spikes/ui-architecture/README.md
   - docs/benchmarks/2026-07-21-editor-bounded.md
4. Verify the baseline instead of trusting handoff numbers:
   - ./scripts/check.sh
   - Expected current result: 112 tests pass; five manual backend benchmarks and one manual fixture materialization remain ignored.
   - Build both existing spikes with pnpm build.

Primary task:
Prototype and measure fine-grained external renderer-store selectors against the integrated 1,000-node and 5,000-node tree fixtures. Determine whether React can preserve the repository's render invariants without placing navigation or editor-hot state in broad context.

Agent policy:
- You are the only writer and committer.
- If subagents are available, start up to three cheap read-only agents concurrently.
- Prefer Haiku, then Sonnet, or the cheapest capable configured model. Do not use Opus when a cheaper model can do the bounded review.
- Give them exact read-only scopes and the repository rules.
- Suggested assignments:
  1. Audit the existing tree harness and propose the smallest normalized renderer-store shape and selector API.
  2. Review React external-store subscription, Profiler, and render-count measurement requirements from primary documentation.
  3. Audit the final diff and benchmark claims against docs/performance-contract.md.
- Subagents must not edit, commit, create worktrees, or make architecture decisions.
- Independently verify every useful finding. Continue alone if cheap subagents are unavailable.

Scope:
- Create a disposable isolated spike, preferably spikes/renderer-store/**.
- Reuse the canonical Rust tree projection/export boundary. Do not copy or reimplement fixture generation.
- Add only focused documentation under docs/benchmarks/** plus required TODO/handoff/architecture/roadmap updates.
- Do not modify editor adapters or claim the bounded editor correctness gap is solved.
- Do not scaffold the product application or desktop shell.
- Do not write ADR-0020 or select the final framework/store.
- Do not add a state library unless a measured deficiency in a small dependency-free external store requires comparison.

Implementation contract:
- Build a normalized in-memory workspace store with stable node records, parent-to-children indices, expansion state, active note, document metadata, and minimal renderer-only selection state.
- Keep editor keystrokes and transient editor selection outside the broad application store.
- Expose narrow selectors and stable subscriptions. A subscriber must not be notified or rendered when its selected value is referentially/equivalently unchanged.
- Use functional updates, Set/Map where measured, stable listener identities, and direct imports.
- No context provider may carry the complete mutable workspace snapshot.
- No component may subscribe to state it does not render.
- Keep one persistent editor-host sentinel mounted across all note selections.
- Navigation must synchronously update local renderer state and must not perform fetch, filesystem, IPC, database, Git, parsing, route loading, dynamic import, or asynchronous work.
- Load all fixture and navigation-critical code before measurement starts.
- No animation for keyboard navigation or measured high-frequency actions.

Required UI decomposition in the spike:
- Stable application shell.
- Virtualized tree host using or adapting the proven fixed-row approach.
- Visible tree-row consumers with selection derived through narrow subscriptions.
- Persistent editor-host sentinel that changes the selected prepared-document identity without remounting.
- Metadata consumer for the active note.
- An unrelated sidebar/settings consumer used to prove isolation.
- Complete empty, selected, disabled, error, and reduced-motion states where relevant.

Render invariants to prove:
- Selecting a note does not render the application shell.
- Selecting a note does not remount the editor host.
- A selection change renders only the previous selected row, next selected row, editor selection consumer, metadata consumer, and any direct focus consumer.
- Offscreen rows do not render for selection changes.
- Expanding/collapsing a folder does not render unrelated rows or editor/metadata consumers.
- Editor-owned typing does not render shell, tree, metadata, or unrelated consumers.
- Updating one metadata field renders only the owning field/consumer.
- Reapplying equivalent state produces zero subscriber notifications and zero React commits.
- Subscriber counts and listener counts remain stable across repeated navigation and cleanup.

Benchmark fixtures and scenarios:
- Use canonical nested-1000, nested-5000, wide-5000, and mixed-5000 projections. Justify any additional fixture.
- Use fresh browser contexts and a production build.
- Record preparation/indexing outside interaction timing.
- Measure at least:
  - 100 cached keyboard note selections across top, middle, and bottom.
  - 100 direct active-note changes involving visible and offscreen rows.
  - 40 shallow and deep expansion changes.
  - 30 editor-owned typing updates.
  - 30 metadata-only updates.
  - 100 equivalent/no-op store updates.
  - subscription setup and complete teardown.
- Record raw samples, P50, P95, P99, maximum, frame gaps, dropped-frame diagnostics, Long Tasks, Long Animation Frames, subscriber notifications, React commits, component render counts, host mounts, and DOM row ceilings.
- Instrument React Profiler in production profiling builds. Keep React Scan development/profiling-only if it is used at all; it is diagnostic, never proof.
- Use trusted CDP keyboard input for the native navigation path. Synthetic handlers may be separate work diagnostics only.
- Use Chrome Performance traces for presentation inspection where available.
- Treat requestAnimationFrame as pre-paint.
- Event Timing below 16 ms is censored and cannot prove the 8 ms contract.
- Long Tasks and Long Animation Frames only cover their browser thresholds; zero entries cannot prove an 8 ms pass.
- Preserve machine-readable raw outputs for claimed production-selection evidence. If raw artifacts are not committed, label results exploratory.

Correctness checks:
- Selector equality suppresses equivalent updates.
- Unsubscribe prevents later notification.
- Subscription mutation during notification is deterministic and safe.
- One subscriber failure cannot corrupt store state or listener bookkeeping.
- Selection remains valid when an ancestor collapses; hidden selection follows the existing tree contract.
- Unavailable/disabled nodes cannot become active through keyboard navigation.
- Node ordering remains the canonical fixture order.
- The tree row pool stays bounded independently of workspace size.
- The editor sentinel mount count remains one.
- No fixture hydration, parsing, indexing, or lazy loading occurs during measured interactions.
- Concurrent benchmark runs and incomplete native-capture lifecycles are rejected.
- Browser console errors, page exceptions, failed correctness checks, incorrect trusted-key counts, or leaked subscribers fail the automation command.
- The benchmark CLI exits deterministically after browser cleanup.

Performance comparison:
- Compare interaction work provisionally with P95 below 8 ms and maximum below 16.67 ms.
- Treat any unnecessary shell/sidebar/editor-host/metadata render as a correctness failure even when timing passes.
- Ordinary shared CI remains correctness-only. Do not add timing assertions without a fixed runner.
- Report fresh-context variance and do not turn one development-machine run into a universal guarantee.

Invalid shortcuts:
- One React subscription at the application root followed by prop fan-out.
- A broad mutable React context for the workspace.
- Remounting the editor host during note selection.
- Pre-rendering all 5,000 rows or using display:none as virtualization.
- Updating every visible row to change selection.
- Counting handler invocation as paint.
- Synthetic dispatchEvent as trusted input evidence.
- Adding Zustand, Redux, Jotai, or another store merely for convenience.
- Changing production architecture based only on React Scan or headless timing.

Documentation:
- Add docs/benchmarks/2026-07-21-renderer-store-selectors.md, or use the current date if the repository date has changed.
- Include objective, exact fixture digests, architecture, selector contract, component ownership, method, commands, raw-evidence location, environment, render-count tables, timing distributions, correctness assertions, limitations, and budget result.
- Update the spike README with exact run and automation commands.
- After the implementation commit, update TODO.md, docs/handoff.md, ARCHITECTURE.md, and docs/roadmap.md in a separate handoff commit.
- Keep the immediate next task explicit: bounded-editor window correctness and desktop bridge measurement still precede ADR-0020.

Verification:
1. Generate canonical browser fixtures with the existing exporter.
2. Typecheck and production-build the new spike.
3. Run deterministic store/selector correctness tests.
4. Run browser automation against the production preview.
5. Verify meaningful content, expected controls, no overlay, no console/page errors, and bounded DOM.
6. Screenshot-inspect representative nested-5000 states and render-count output.
7. Run the trusted keyboard scenario and at least five fresh-context nested-5000 repetitions.
8. ./scripts/generate.sh
9. ./scripts/check.sh
10. git diff --check
11. Confirm generated contracts and canonical fixture digests did not drift.
12. Confirm generated fixtures, build output, browser profiles, traces, screenshots, and temporary results are not accidentally tracked.
13. Run the cheap final-review subagent and resolve every valid finding.

Commit discipline:
1. Implement and verify the store-selector spike, tests, harness README, and benchmark report:
   perf: benchmark renderer store selectors
2. Update TODO.md, docs/handoff.md, ARCHITECTURE.md, and docs/roadmap.md:
   docs: hand off renderer store findings

Keep dependency order and omit a commit only when it has no changes. Do not begin the bounded-editor or desktop-bridge implementation in this session.

Completion report:
- Commit hashes and files per commit.
- Exact test/build/browser commands and results.
- Render counts per interaction.
- Subscriber notification counts and leak result.
- Representative and repeated timing results.
- DOM row ceiling, editor-host mount count, and dropped-frame observations.
- Honest pass/fail against every render and timing invariant.
- Useful cheap-subagent findings.
- Known limitations and immediate next task.
- Final git status.

Do not merge other worktrees, push, or start product UI scaffolding. Stop after the verified clean handoff.
```
