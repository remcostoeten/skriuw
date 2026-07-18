# Editor performance audit + alternatives to BlockNote

> Research spike for [#145](https://github.com/remcostoeten/skriuw/issues/145).
> Author: audit run 2026-07-18. Bundle numbers are **measured**; runtime numbers
> are structural + a repeatable recipe (see [Runtime](#phase-1b--runtime), the
> automation harness in this repo cannot measure hydrated FPS/TTI reliably).

## TL;DR recommendation

**Stay on BlockNote. Do not migrate.** The editor is not where the weight is, and
the integration surface is far too deep to justify a rewrite. Spend the effort on
three targeted wins instead:

1. **Shed Mantine from the editor stack (~87 KB gzip).** The main editor already
   rebuilt its toolbar as plain buttons (see the toolbar memo / DH work); Mantine
   is largely dead view-layer weight now. Consolidate onto one BlockNote UI
   variant.
2. ~~**Stop shipping two BlockNote UI variants.**~~ **DONE** — the admin seed
   editor was moved onto `@blocknote/mantine` and `@blocknote/shadcn` was dropped
   from deps + `next.config.ts`. The web app no longer ships a second BlockNote UI
   variant on the `/admin` route.
3. **The desktop slowness in [#216](https://github.com/remcostoeten/skriuw/issues/216)
   is a runtime/rendering problem, not a bundle problem** — chase it with the
   runtime recipe below, not by swapping editors. A different editor framework
   would inherit the same ProseMirror/CodeMirror rendering costs.

The single largest thing in the desktop bundle is **not** the editor — it is
`@excalidraw/excalidraw` at **1.4 MB gzip** (the drawing/annotation block). That is
already lazy-loaded, but it dwarfs the entire editor stack ~3×.

---

## Phase 1a — BlockNote bundle audit

### Method

- **Bundle measured:** `packages/web-spa` (Vite 6 production build) — this is the
  exact artifact Tauri loads as `frontendDist`, i.e. the desktop bundle that
  [#216](https://github.com/remcostoeten/skriuw/issues/216) is about.
- Analyzer: `rollup-plugin-visualizer` wired into `vite.config.ts` behind
  `ANALYZE=true` (does not affect normal builds). Per-module gzip sizes were
  aggregated by npm package from the visualizer's module tree.
- `apps/web` (Next.js) uses **Turbopack**, so the webpack-based
  `@next/bundle-analyzer` does not hook it. The editor chunk there resolves the
  same packages, so the web-spa breakdown is representative of editor cost on both
  targets. (`source-map-explorer` was added for future Next-side runs via
  `productionBrowserSourceMaps`.)
- Reproduce: `cd packages/web-spa && ANALYZE=true bun run build`, then open
  `dist/bundle-report.html`.

### Editor stack — gzip by package

| Package group                                                                  | gzip             |
| ------------------------------------------------------------------------------ | ---------------- |
| `@blocknote/core`                                                              | 83 KB            |
| `@blocknote/react`                                                             | 34 KB            |
| `@blocknote/mantine`                                                           | 6 KB             |
| **BlockNote total**                                                            | **~123 KB**      |
| `@mantine/core` + `@mantine/hooks`                                             | ~87 KB           |
| ProseMirror (`-view` 58, `-model` 29, `-transform` 19, `-tables` 16, + others) | ~122 KB          |
| TipTap (`@tiptap/core` 39 + extensions)                                        | ~51 KB           |
| Yjs + `lib0` + `y-prosemirror` + `y-protocols`                                 | ~112 KB          |
| **Editor stack grand total**                                                   | **~530 KB gzip** |

This tracks the `~486 KB` figure already documented in `vite.config.ts` (the DH-06
note); the delta is Mantine hooks + collab helpers included here.

### Key observations

- **The engine is ProseMirror, not BlockNote.** ProseMirror (~122 KB) + TipTap
  (~51 KB) = ~173 KB. BlockNote itself only adds ~123 KB of block/schema
  abstraction on top. **Any WYSIWYG alternative that keeps rich blocks lands on
  ProseMirror/Lexical-scale runtime anyway** — you cannot buy your way out of the
  ~170 KB engine floor without dropping to plain markdown/CodeMirror (which we
  already have as the source-view mode and which cannot host our custom blocks).
- **Mantine (~87 KB) is the most sheddable line.** It is BlockNote's default UI
  chrome. The main editor already replaced the formatting toolbar with plain
  `<button>`s (toolbar-raf-starvation fix), so most Mantine surface is unused.
- **Collab (~112 KB) is a fixed cost.** Yjs + `y-prosemirror` is required by the
  real-time collaboration feature and the anchored-marks engine
  (`features/collaboration/`). It moves with us to _any_ editor that supports Yjs;
  Lexical's Yjs binding is less mature than `y-prosemirror`.
- **Dead-ish weight:** two BlockNote UI variants ship. `@blocknote/mantine` for the
  main editor, `@blocknote/shadcn` for the admin seed editor
  (`features/admin/seed/seed-note-editor.tsx`) only. Standardizing on one removes a
  duplicate view layer.
- **Context — editor is NOT the biggest chunk.** Desktop bundle top offenders
  (gzip): `@excalidraw/excalidraw` **1.4 MB**, `mermaid` 535 KB, `cytoscape`
  249 KB, shiki langs/engine ~344 KB, `katex` 144 KB. All are lazy feature chunks,
  but they establish that the editor stack is a mid-tier cost, not the ceiling.

### Tree-shaking

BlockNote is already dynamically imported (`preload-rich-text-editor.ts`) and
deliberately **not** grouped into a manual chunk (DH-06) so it stays off the static
startup graph — verified: `rich-text-editor-*.js` (188 KB gz) and `extensions-*.js`
(174 KB gz) are separate on-demand chunks. Tree-shaking is working; the remaining
weight is genuinely-used engine code, not dead re-exports.

## Phase 1b — Runtime

**Honesty note:** this repo's Claude-in-Chrome automation harness cannot produce
trustworthy hydrated-runtime numbers — Next PPR pages do not hydrate under
automation (flight payload empty) and background/hidden tabs throttle `rAF` to ~0,
so FPS is unmeasurable. The numbers below are structural; the recipe hands the
measurement to a human with real DevTools.

### Structural findings

- `rich-text-editor.tsx` is 816 lines and mounts a substantial plugin set: 10
  custom React specs (5 block, 5 inline), plus custom ProseMirror plugins
  (`auto-mark`, `inline-chip-nav`, `select-all`, `code-block-indent`,
  `search-plugin`, `vim-plugin`). Every custom React block renders through a React
  subtree per node — this is the prime suspect for [#216](https://github.com/remcostoeten/skriuw/issues/216)'s
  scroll/type lag on large notes, and it is a **BlockNote-architecture** cost
  (React-per-block), not a bundle cost.
- Prior measured perf work already removed two per-keystroke re-render cascades
  (typing-cascade / cursor-reporter → external store; JSONB richContent echo).
  The remaining lag is consistent with React reconciliation over many custom
  block components, which no framework swap fixes for free.

### Repeatable runtime recipe (run manually with DevTools)

1. `cd apps/web && bun run dev`, open `http://localhost:3000/app` in a **real**
   Chrome window (not automation), signed in or guest.
2. Create fixture notes of 50 / 200 / 500 blocks (a script that repeats a mixed
   block sample into one note body works).
3. **TTI / first-keystroke:** DevTools Performance panel → reload → record. Mark
   editor-visible and first-accepted-keystroke. Compare cold vs. warm.
4. **Block render:** record while scrolling top→bottom; read scripting/rendering
   time and dropped frames per fixture size.
5. **Memory:** DevTools Memory → heap snapshot per fixture size.
6. **Remount cost:** record while navigating note→note; confirm whether the
   BlockNote view unmounts/remounts (it should be keyed stable per the
   split-toggle-remount fix).

---

## Phase 2 — Alternatives matrix

Scored against **our real feature set**, not in the abstract. Our editor must
replicate: 5 custom block types (checklist, code block w/ shiki, mermaid diagram,
Excalidraw drawing, file-tree), 5 custom inline types (mark, note-link/wikilink,
person `$`, tag `#`, user `@`), markdown ⇄ document serialization
(`editor-serialization.ts`), Yjs/CRDT collaboration + anchored marks, a markdown
source-view toggle (CodeMirror), AI selection/chip roundtrip, and search + vim
plugins. **37 source files** import BlockNote/ProseMirror/Yjs directly — that is the
migration surface.

Legend: ● strong · ◐ partial/effortful · ○ weak/missing.

| Criterion (weight)             | BlockNote (current)              | TipTap-direct                                 | ProseMirror-direct          | Lexical                                          | Milkdown                  | CodeMirror 6                   | Slate                              |
| ------------------------------ | -------------------------------- | --------------------------------------------- | --------------------------- | ------------------------------------------------ | ------------------------- | ------------------------------ | ---------------------------------- |
| Editor-core gzip (high)        | ◐ ~123 KB on PM                  | ● sheds ~123 KB, keeps PM ~173 KB             | ● lightest WYSIWYG-capable  | ● ~60 KB (own engine)                            | ◐ PM-based, ~like TipTap  | ● tiny, but not WYSIWYG blocks | ● small                            |
| Custom block/inline API (high) | ● React specs, already built ×10 | ● TipTap nodeviews (rebuild ×10)              | ◐ raw nodeviews (most work) | ◐ decorator nodes (rebuild, different model)     | ◐ PM plugins              | ○ no block model               | ◐ React elements, fragile at scale |
| Yjs / CRDT collab (high)       | ● `y-prosemirror` (mature)       | ● same `y-prosemirror`                        | ● same                      | ◐ `@lexical/yjs` (less battle-tested)            | ● `y-prosemirror`         | ◐ `y-codemirror` (text only)   | ○ weak                             |
| Markdown ⇄ doc (high)          | ● built-in + our serializer      | ● TipTap markdown ext + reuse serializer      | ◐ hand-rolled               | ◐ hand-rolled                                    | ● native markdown WYSIWYG | ● it _is_ the markdown         | ◐ plugin                           |
| Time-to-first-keystroke (high) | ◐ PM init                        | ◐ same PM init                                | ● leanest                   | ● designed for it                                | ◐                         | ●                              | ◐                                  |
| Paste raw md → rendered (high) | ●                                | ●                                             | ◐                           | ◐                                                | ●                         | n/a (stays source)             | ◐                                  |
| Source-view toggle (med)       | ● have it (CM6)                  | ● have it                                     | ●                           | ●                                                | ●                         | ● native                       | ●                                  |
| Maintenance/community (med)    | ● active                         | ● very active                                 | ● stable core               | ● Meta-backed                                    | ◐ smaller                 | ● very active                  | ◐ slowing                          |
| **Migration cost from here**   | **none**                         | **high** (rebuild 10 specs + 37 import sites) | **very high**               | **very high** (different doc model, redo collab) | **high**                  | **n/a** (can't host blocks)    | **very high**                      |

### Reading the matrix

- **TipTap-direct** is the only migration with a real upside: it sheds BlockNote's
  ~123 KB abstraction while keeping the exact ProseMirror engine and the mature
  `y-prosemirror` collab, so our custom blocks port as TipTap nodeviews rather than
  a ground-up rewrite. But it still means rebuilding all 10 specs and touching 37
  import sites for a ~123 KB gzip win on an already-lazy chunk. **Poor ROI right
  now.**
- **Lexical** looks lean (~60 KB) but its win evaporates against our needs: a
  different document model (rebuild all 10 specs from scratch), a less-proven Yjs
  binding, and a redo of the anchored-marks engine. High risk, high cost.
- **ProseMirror-direct / Slate** — most work, least payoff.
- **CodeMirror 6 / Monaco** — cannot host WYSIWYG custom blocks; they are the
  _source-view_ tool, which we already use. Not a replacement for the block editor.
- **Milkdown** — also ProseMirror underneath, so no engine savings; a lateral move
  with a smaller community.

---

## Phase 3 — Conclusion

The editor stack is ~530 KB gzip, of which only ~123 KB is BlockNote-specific and
~112 KB (collab) + ~173 KB (ProseMirror/TipTap engine) would survive almost any
migration. There is no alternative that meaningfully reduces the runtime cost of
rendering our custom blocks, because that cost is React-per-block reconciliation
plus the ProseMirror/Lexical engine floor — not the BlockNote wrapper.

**Do this instead of migrating:**

1. Remove Mantine from the editor path (~87 KB gzip) — consolidate on one BlockNote
   UI variant now that the toolbar is plain buttons.
2. Drop the second BlockNote UI variant (mantine vs shadcn duplication).
3. Treat [#216](https://github.com/remcostoeten/skriuw/issues/216) as a rendering
   problem: run the runtime recipe above, then attack React-per-block cost
   (virtualize/skip off-screen block subtrees, memoize custom spec renderers).

Re-evaluate a TipTap-direct move only if (a) BlockNote's roadmap stalls, or (b) the
~123 KB abstraction becomes the measured bottleneck after the wins above — neither
is true today.
