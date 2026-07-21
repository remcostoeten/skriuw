# Initial editor candidate switching observations

Date: 2026-07-21

## Purpose

This first UI architecture spike tests whether direct ProseMirror or direct Lexical can swap already-prepared note state inside one frame while retaining one editor host. It deliberately excludes React and the desktop bridge so editor DOM reconciliation is visible without framework work.

These are single-run development-machine observations. They prove the harness and reveal scaling direction; they do not select an editor or satisfy the final fixed-runner proof requirement.

## Method

The production Vite build prepared eight deterministic notes for each candidate and size. Each note contained the same mixture of headings, paragraphs, and quotes. Preparation happened before timing. One warm-up was discarded, then 100 cached switches alternated between note states. Thirty editor-owned text updates followed. Each sample recorded synchronous state installation, an explicit DOM-count read that forces layout, the next animation-frame opportunity, and the frame gap.

ProseMirror retained one `EditorView` and called `updateState`. Lexical retained one core editor and called `setEditorState`. Neither candidate used plugins, history, React, routing, parsing, persistence, IPC, Git, or dynamic imports.

```bash
cd spikes/ui-architecture
pnpm install --frozen-lockfile
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173
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

| Candidate | Blocks | Prepare | Switch P50 | Switch P95 | Switch P99 | Switch max | Layout P95 | Next-frame P95 | Typing P95 | Typing max | Dropped | Long tasks | DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ProseMirror | 50 | 0.4 | 0.9 | 1.4 | 1.5 | 1.7 | 0.1 | 16.5 | 0.3 | 0.3 | 0 | 0 | 53 |
| ProseMirror | 500 | 3.6 | 6.6 | 8.7 | 11.9 | 12.0 | 0.1 | 16.6 | 0.5 | 0.5 | 0 | 0 | 525 |
| ProseMirror | 2,000 | 11.2 | 36.0 | 39.0 | 49.3 | 58.9 | 0.1 | 33.3 | 0.7 | 1.1 | 99 | 2 | 2,100 |
| Lexical | 50 | 6.4 | 0.8 | 0.9 | 1.1 | 1.3 | 0.1 | 16.6 | 0.3 | 0.3 | 0 | 0 | 100 |
| Lexical | 500 | 62.9 | 3.3 | 5.3 | 5.9 | 6.7 | 0.1 | 16.6 | 0.4 | 0.4 | 0 | 0 | 1,000 |
| Lexical | 2,000 | 136.1 | 15.8 | 20.5 | 27.4 | 30.6 | 0.1 | 44.4 | 1.1 | 1.7 | 99 | 6 | 4,000 |

Every run reported one host mount and zero preparation calls during switching. Browser error output was empty. Both candidates passed the synchronous switching targets at 50 blocks. At 500 blocks, Lexical passed P95 and maximum while ProseMirror missed the 8 ms P95 target. Neither whole-document DOM replacement passed at 2,000 blocks, and both dropped 99 observed frames during the 100-switch scenario.

## Interpretation

Lexical scales better for full prepared-state replacement in this minimal corpus, but its state preparation cost and DOM node count are higher. ProseMirror prepares states cheaply and keeps a smaller DOM, but whole-document `updateState` crosses the P95 target by 500 blocks and becomes far too expensive at 2,000 blocks.

The 2,000-block result rejects a naive architecture that replaces one fully rendered document DOM on every navigation. Next editor spike must measure a bounded rendered viewport or retained per-note view strategy, cached selection restoration, and memory cost. Product plugins and real structured Markdown operations must then be added symmetrically before ADR-0020 can select an editor.

The editor-owned update numbers are API-driven mutations, not native keyboard-event or paint-latency proof. Memory was not measured in this slice because no repeatable heap-isolation protocol or ceiling is fixed yet.
