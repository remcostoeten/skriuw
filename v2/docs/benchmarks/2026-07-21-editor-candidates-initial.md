# Initial editor candidate switching observations

Date: 2026-07-21

## Purpose

This first UI architecture spike tests whether direct ProseMirror or direct Lexical can swap already-prepared note state inside one frame while retaining one editor host. It deliberately excludes React and the desktop bridge so editor DOM reconciliation is visible without framework work.

These are development-machine observations with one representative run per size and five additional runs at 500 blocks. They prove the harness and reveal scaling direction; they do not select an editor or satisfy the final fixed-runner proof requirement.

## Method

The production Vite build prepared eight deterministic notes for each candidate and size. Each note contained the same mixture of headings, paragraphs, and quotes. Preparation happened before timing. One warm-up was discarded, then 100 cached switches alternated between note states. Thirty editor-owned text updates followed. Each sample recorded synchronous state installation, an explicit editor-height read that forces layout, total end-to-layout duration, the next animation-frame opportunity, and the frame gap.

ProseMirror retained one `EditorView` and called `updateState`. Lexical retained one core editor and called `setEditorState`. Neither candidate used plugins, history, React, routing, parsing, persistence, IPC, Git, or dynamic imports.

```bash
cd spikes/ui-architecture
bun install --frozen-lockfile
bun run build
bunx vite preview --host 127.0.0.1 --port 4173
```

## Environment

- Linux 7.1.2-arch3-1 x86_64
- Intel Core i7-10700F, 16 logical CPUs
- 23 GiB memory
- Node 24.15.0
- pnpm 11.1.2
- Vite 8.1.5 production build
- Headless Chrome 149.0.0.0 through `agent-browser`
- ProseMirror state 1.4.4, view 1.42.1, model 1.25.11, schema-basic 1.2.4
- Lexical and `@lexical/rich-text` 0.48.0

## Observations

All values are milliseconds except counts.

| Candidate | Blocks | Prepare | Sync P95 | Layout P95 | Total P50 | Total P95 | Total P99 | Total max | Next-frame P95 | Typing total P95 | Dropped | Long tasks | DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ProseMirror | 50 | 1.7 | 1.3 | 0.1 | 0.9 | 1.4 | 1.6 | 1.6 | 16.5 | 0.5 | 0 | 0 | 53 |
| ProseMirror | 500 | 2.0 | 7.2 | 0.1 | 6.4 | 7.2 | 7.7 | 11.1 | 16.5 | 1.0 | 0 | 0 | 525 |
| ProseMirror | 2,000 | 6.4 | 48.7 | 0.1 | 36.5 | 48.8 | 53.1 | 68.0 | 49.6 | 2.2 | 99 | 8 | 2,100 |
| Lexical | 50 | 10.0 | 1.0 | 1.0 | 1.4 | 1.9 | 2.1 | 2.2 | 16.5 | 0.6 | 0 | 0 | 100 |
| Lexical | 500 | 35.9 | 4.3 | 6.3 | 9.4 | 10.3 | 11.0 | 12.7 | 16.5 | 1.0 | 0 | 0 | 1,000 |
| Lexical | 2,000 | 132.5 | 15.8 | 26.1 | 36.9 | 40.8 | 46.3 | 50.0 | 33.2 | 2.7 | 99 | 2 | 4,000 |

Every run reported one host mount and zero preparation calls during switching. Browser error output was empty. Both candidates passed the end-to-layout switching targets at 50 blocks. One ProseMirror 500-block run passed while Lexical did not; repeated runs showed that neither candidate passes reliably.

Five additional 500-block production runs recorded these total switch P95 values:

- ProseMirror: 8.2, 11.0, 7.5, 9.5, and 9.1 ms; median 9.1 ms. Maximum samples reached 35.2 ms and five dropped frames were observed across the five runs.
- Lexical: 10.9, 12.0, 10.1, 10.8, and 37.3 ms; median 10.9 ms. Maximum samples reached 41.3 ms and nine dropped frames were observed across the five runs.

Neither whole-document DOM replacement passed at 2,000 blocks, and both dropped 99 observed frames during the representative 100-switch run.

## Interpretation

ProseMirror keeps a smaller DOM and prepares states much faster. Lexical reports a shorter synchronous `setEditorState` call, but significant work remains deferred until layout; sync-only comparison would be misleading. Neither candidate reliably satisfies the complete 500-block navigation target under repeated whole-document replacement, and both are far too expensive at 2,000 blocks.

The 2,000-block result rejects a naive architecture that replaces one fully rendered document DOM on every navigation. Next editor spike must measure a bounded rendered viewport or retained per-note view strategy, cached selection restoration, and memory cost. Product plugins and real structured Markdown operations must then be added symmetrically before ADR-0020 can select an editor.

The editor-owned update numbers are API-driven mutations, not native keyboard-event or paint-latency proof. Memory was not measured in this slice because no repeatable heap-isolation protocol or ceiling is fixed yet.
