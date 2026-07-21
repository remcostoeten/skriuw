# Opus execution prompts — MVP UI, cost-optimized

Each prompt below is one self-contained session. Run them in order. They are written
to minimize token spend: no re-benchmarking, no handoff documents, no re-deriving
decisions already recorded in the repo.

## Standing rules for every session (paste at the top of each prompt)

```
Repo: /home/remcostoeten/dev/skriuw-standalone, branch feat/instant-local-first-foundation.

Cost rules — follow strictly:
- Do NOT re-run or re-create benchmarks, spikes, or fresh-Chrome measurement harnesses.
- Do NOT write handoff docs or benchmark docs. The only docs you may touch are
  TODO.md checkboxes and, when a prompt says so, one ADR.
- Decisions already made (do not relitigate): ProseMirror selected, Lexical rejected;
  bounded 192-block window validated; external store + useSyncExternalStore validated;
  Tauri 2 bridge validated; virtualized tree validated. Evidence lives in
  docs/benchmarks/ — read only what you need, do not summarize it back.
- Reuse spike code from spikes/ by porting it, not rewriting it.
- Definition of done: ./scripts/check.sh passes, new invariants have tests,
  logical commits on the feature branch. Nothing else.
```

## Prompt 1 — ADR-0020 (small, docs-only)

Write `docs/adr/0020-ui-architecture.md` selecting: ProseMirror (bounded canonical
window, per docs/benchmarks/2026-07-21-editor-structured-window.md), React with the
external renderer store from spikes/renderer-store, Vite as build tool, Tauri 2 as
desktop shell. Record by fiat: undo history groups edits within 500 ms bursts, capped
at 200 entries per note; fixed-runner performance evidence is deferred until the MVP
exists. Mark the corresponding UI-architecture-gate checkboxes in TODO.md. One commit.

## Prompt 2 — Product app scaffold + shell

Create the real product app (suggested: `app/` at repo root): Vite + React + TypeScript
+ Tauri 2 pointing at the existing Rust workspace. Port the renderer store from
spikes/renderer-store into `app/` as the production store. Build the persistent
application shell with icon navigation (TODO.md "MVP UI" item 1). Wire Tauri commands
to the existing skriuw-runtime for workspace bootstrap. No editor yet. Shell must
render the bootstrapped tree data from a real database seeded via the existing CLI
seed flow. Commit in logical steps.

## Prompt 3 — Sidebar: tree, CRUD, drag/reorder

Port the virtualized tree from spikes/tree-virtualization into the app sidebar.
Wire it to real backend operations: create, rename, trash, restore, move/reorder
(rank allocation is backend-owned — see TODO.md "ordering and rank allocation"
contract). Context menus and keyboard shortcuts per TODO.md. Optimistic updates go
through the store; acknowledgements reconcile via the FIFO runtime results. Tests for
the store reducers; rely on existing backend tests for persistence.

## Prompt 4 — Editor in product

Port the bounded ProseMirror editor from spikes/ui-architecture (structured window,
canonical JSON, history model) into the app as the note editor. Implement pragmatically,
inside the product, without new spikes:
- select-all/copy and find against the canonical document JSON, not the DOM
- IME: keep the existing composition guard; defer window movement until composition ends
- history: 500 ms grouping / 200-entry cap from ADR-0020
Wire saves through the runtime save batching. Slash-command menu using the existing
slash-query plugin state. Markdown input rules are already in the spike schema.

## Prompt 5 — Metadata sidebar, versions, settings

Right sidebar with note metadata (fields already exist in the canonical schema; no
people/tags). Version list from the Git history cache with preview and restore using
existing backend flows. Settings UI over the version-1 settings document. Keep it
minimal; no new backend surface should be needed.

## Prompt 6 — Command palette + keyboard-first pass

Central command registry, command palette, and keyboard-first navigation across
shell, sidebar, and editor. Register the commands built in prompts 3–5 rather than
creating parallel code paths.

## Explicitly deferred (do not let any session pick these up)

- Fixed-runner / reference-hardware performance evidence
- Accessibility whole-document traversal beyond ARIA basics already in the tree spike
- WASM/web runtime, sync, journal
- React Scan, 100-switch zero-dropped-frame proof — measure once after Prompt 6
