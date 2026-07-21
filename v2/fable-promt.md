# Fresh Fable 5 session prompt

Copy everything below into Fable 5. It owns tree virtualization while the primary Codex agent owns editor presentation timing and bounded editor projection.

```text
You are the lead implementation agent for one isolated Skriuw architecture slice.

Repository isolation:
- Source: /home/remcostoeten/dev/skriuw-standalone
- Worktree: /home/remcostoeten/dev/skriuw-fable-tree
- Branch: feat/tree-virtualization-benchmark
- Verified base commit: 0d726c8 on feat/instant-local-first-foundation
- Never edit /home/remcostoeten/dev/skriuw-standalone.
- No remote exists. Do not claim anything is pushed.

Create the worktree only if both the path and branch are absent:

git -C /home/remcostoeten/dev/skriuw-standalone worktree add \
  -b feat/tree-virtualization-benchmark \
  /home/remcostoeten/dev/skriuw-fable-tree \
  0d726c8

cd /home/remcostoeten/dev/skriuw-fable-tree

If the path or branch already exists, stop and report its exact state. Never delete, reset, overwrite, rebase, merge, or reuse an unknown worktree.

Your isolated task:
Implement and measure nested tree virtualization using the repository's canonical deterministic 1,000-note and 5,000-note fixtures.

Agent policy:
- You are the only agent allowed to edit files, create commits, or make architecture decisions.
- Start up to three cheaper read-only subagents concurrently.
- Prefer Haiku or the cheapest capable model, then Sonnet. Do not use Opus unless it is actually cheaper in the user's configuration.
- Suggested bounded assignments:
  1. Inventory the deterministic fixture contract and propose the smallest exact fixture-to-browser projection.
  2. Research fixed-height nested-tree virtualization, keyboard behavior, and ARIA tree requirements using official sources.
  3. Review the benchmark method against docs/performance-contract.md and audit the final diff.
- Subagents must not edit, commit, create worktrees, or run destructive commands.
- Give every subagent AGENTS.md constraints and exact file/task boundaries.
- Independently verify their findings. Do not delegate reading repository instructions.
- Continue alone if cheap subagents are unavailable.

Mandatory start:
1. Verify git status, branch, worktree path, recent commits, and baseline tests.
2. Read completely, in order:
   - AGENTS.md
   - TODO.md
   - docs/handoff.md
   - ARCHITECTURE.md
   - docs/roadmap.md
   - docs/performance-contract.md
   - docs/fixtures.md
   - docs/adr/0004-defer-ui-editor.md
   - docs/adr/0010-rank-allocation.md
   - docs/adr/0016-deterministic-scale-fixtures.md
   - crates/skriuw-fixtures/Cargo.toml
   - crates/skriuw-fixtures/src/lib.rs
   - relevant fixture tests
3. Run ./scripts/check.sh before editing.
4. Stop if the worktree is not clean.

Parallel ownership:
- You own:
  - spikes/tree-virtualization/**
  - the smallest fixture projection/export boundary under crates/skriuw-fixtures/examples/**
  - focused correctness coverage under crates/skriuw-fixtures/tests/** if necessary
  - docs/benchmarks/2026-07-21-tree-virtualization.md
  - focused docs/fixtures.md instructions
  - a final separate TODO.md/docs/handoff.md handoff commit
- Primary Codex concurrently owns:
  - spikes/ui-architecture/**
  - every editor adapter, editor metric, and editor benchmark document
  - presentation timing and bounded editor projection
  - renderer-store and desktop-bridge work after this slice
- Do not modify:
  - spikes/ui-architecture/**
  - docs/benchmarks/*editor*
  - backend workload benchmark implementation
  - ARCHITECTURE.md
  - existing ADRs or ADR-0020
  - product UI scaffolding
  - unrelated production code

Fixture contract:
- Use generate_workspace_fixture as the source of truth.
- Exercise canonical 1,000-note and 5,000-note workspaces.
- Nested shape is primary. Cover wide and mixed where they reveal distinct flattening or sibling-list behavior.
- Do not reproduce the Rust generator algorithm in TypeScript.
- Do not commit generated large JSON, databases, build output, or browser artifacts.
- Add the smallest deterministic Rust-to-browser projection if required.
- Preserve semantic sibling order and stable IDs.
- Assert metadata, node/folder/document counts, maximum depth, parent relationships, and deterministic projection.
- Existing canonical fixture digests must not change.

Implementation target:
Build a disposable production browser harness for a dense desktop sidebar tree without React or a virtualization/state dependency unless measurements prove one is needed.

Required behavior:
- Fully hydrate the in-memory tree before interaction measurement.
- Build parent-to-children indices before measured navigation.
- Maintain explicit expansion state and deterministic visible-tree flattening.
- Use a fixed row height unless evidence proves variable heights are required.
- Render a bounded viewport window with overscan; DOM row count must not scale with 5,000 nodes.
- Preserve stable row identity.
- Support selection, roving focus, and scroll-to-selection.
- Support Arrow Up/Down, Arrow Left/Right collapse/expand/parent/child, Home, and End.
- Provide correct tree/treeitem semantics, aria-level, aria-expanded, aria-selected, and accessible labels.
- Cover empty, selected, focused, collapsed, expanded, disabled, error, and reduced-motion states.
- Do not animate keyboard navigation.
- No disk, IPC, network, parsing, fixture generation, or lazy loading inside measured interactions.
- No loading spinner or post-hydration skeleton.

Correctness requirements:
- Compare visible order with a straightforward reference flattener.
- Collapsed descendants never render.
- Expansion reveals descendants in deterministic sibling order.
- Selection survives viewport movement.
- Keyboard navigation never selects an unavailable or missing row.
- Deep nesting has correct depth and parent navigation.
- Rendered row count remains bounded for 5,000 nodes.
- A selection-only change mutates only previous row, next row, and direct selection consumers when both are rendered.
- Projection is deterministic and generated outside interaction timing.
- Host mount count remains one.

Benchmark protocol:
- Production build, fresh browser contexts, fixed viewport, no throttling.
- Keep fixture generation/projection, indexing, and initial flattening outside interaction measurements, but record their costs separately.
- Measure separately:
  - index/preparation
  - initial flatten and render
  - 100 keyboard selection moves
  - shallow and deep expand/collapse
  - top-to-middle-to-bottom scroll jumps
  - reveal selected descendant through ancestor expansion
  - visible-row recomputation
  - DOM patch work
  - forced layout
  - total interaction-to-layout
  - native interaction timing where supported
  - frame gaps and dropped-frame diagnostics
  - Long Tasks and Long Animation Frames with explicit API thresholds
  - rendered rows and total DOM elements
  - host mounts and mutated row count
- Store raw samples plus P50, P95, P99, maximum, environment, browser, build mode, and unsupported APIs.
- Use Chrome Performance traces for trusted keyboard interaction and frame verification where available.
- Treat requestAnimationFrame as pre-paint; never mislabel it as presentation.
- PerformanceEventTiming below 16 ms is censored and cannot prove the repository's 8 ms gate.
- Long Tasks and Long Animation Frames only surface work above their browser thresholds; zero entries does not prove the 8 ms main-thread ceiling.
- Compare synchronous interaction work provisionally against P95 <8 ms and max <16.67 ms.
- No timing assertions in ordinary CI.

Invalid shortcuts:
- CSS clipping without bounded DOM.
- display:none or hidden pre-rendered full trees.
- One placeholder DOM node per omitted row.
- Remounting the tree host during navigation.
- Parsing or generating fixtures during measured interaction.
- Synthetic dispatchEvent as native-input evidence.
- Reporting development-machine observations as universal guarantees.

Documentation:
- Add docs/benchmarks/2026-07-21-tree-virtualization.md.
- Include objective, exact fixtures/digests, method, commands, raw samples, summary statistics, DOM ceiling, environment, correctness assertions, limitations, and budget result.
- Update docs/fixtures.md only if fixture projection instructions change.
- Do not create an ADR; this slice measures candidates for later ADR-0020.
- Update TODO.md and docs/handoff.md only in the final separate handoff commit.

Verification:
1. Harness typecheck and production build.
2. Browser automation against production preview.
3. Console/page error check.
4. Exercise 1,000 and 5,000 nodes at top, middle, bottom, shallow, and deep positions.
5. Visually inspect dense tree states.
6. Focused Rust fixture/projection tests.
7. ./scripts/generate.sh
8. ./scripts/check.sh
9. git diff --check
10. Confirm generated contracts and canonical fixture digests did not drift.
11. Confirm no generated fixture or browser artifact is tracked.
12. Run the cheap review subagent against the final diff and resolve valid findings.

Commit discipline:
1. feat: expose tree benchmark fixtures
2. perf: benchmark nested tree virtualization
3. docs: record tree virtualization findings
4. docs: hand off tree virtualization slice

Omit a commit when it has no corresponding changes. Keep the shared TODO/handoff commit separate because primary Codex will reconcile it manually.

Acceptance criteria:
- Canonical Rust fixtures drive the browser harness.
- Nested 1,000/5,000 workloads run; wide/mixed coverage is justified.
- DOM rows are bounded independently of workspace size.
- Ordering, expansion, selection, keyboard focus, scrolling, and parent navigation have deterministic regression coverage.
- Production measurements include raw distributions, DOM counts, frame diagnostics, and environment.
- Claims honestly reflect Event Timing, rAF, Long Task, and LoAF limitations.
- All verification passes; commits are logical; worktree is clean.
- No editor-owned or unrelated files changed.

At completion report:
- Commit hashes and files per commit.
- Verification commands and exact results.
- Representative 1,000/5,000 measurements.
- DOM row ceiling.
- Performance-contract result per interaction.
- Known limitations and immediate next task.
- Cheap subagent tasks and useful findings.
- Final git status.
- Any shared-doc commit primary should reconcile manually.

Do not merge, cherry-pick, push, or modify the primary worktree. Stop after delivering the clean committed branch.
```
