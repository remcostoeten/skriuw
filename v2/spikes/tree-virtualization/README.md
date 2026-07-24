# Tree virtualization spike

This isolated browser harness measures a dense virtualized sidebar tree over the canonical deterministic Rust fixtures without React, a virtualization library, routing, persistence, Markdown parsing, or desktop IPC. It is measurement code, not the product UI.

## Run

```bash
cd spikes/tree-virtualization
./scripts/export-fixtures.sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4174
```

Open `http://127.0.0.1:4174`, choose a fixture, then load it for interactive inspection or run the full benchmark. `?auto=nested-5000` runs one fixture on load. The automation boundary is `window.__SKRIUW_TREE_BENCHMARK__` with `run(fixture)`, `prepareTrusted(fixture)`, `finishTrusted()`, and `galleryChecks()`.

`scripts/bench.mjs` drives fresh headless Chromium contexts over the production preview, dispatches trusted Arrow-key input through the Chrome DevTools Protocol, and writes raw result JSON into `results/`:

```bash
node scripts/bench.mjs http://127.0.0.1:4174 nested-1000 nested-5000 wide-5000 mixed-5000
```

## Measured contract

- Fixtures come from `cargo run -p skriuw-fixtures --example export_tree_projection`; nothing generated is committed.
- The complete tree, parent-to-children indices, and the initial flatten are prepared before any measured interaction; their costs are recorded separately.
- One tree host is mounted once; rows are recycled fixed-height elements positioned by transform inside one scroll container with real scroll geometry.
- Rendered DOM rows stay bounded by viewport height plus overscan regardless of workspace size.
- Rows expose tree/treeitem semantics with aria-level, aria-setsize, aria-posinset, aria-expanded, aria-selected, and aria-disabled.
- Keyboard: Arrow Up/Down move selection, Arrow Right expands or enters, Arrow Left collapses or moves to the parent, Home/End jump. Navigation is never animated.
- Correctness checks compare the iterative flattener with a recursive reference, prove collapsed descendants never render, bound rendered rows and selection-only mutations, and verify deep parent navigation plus disabled-row skipping.

Settled duration (synchronous work plus one forced layout read) is compared provisionally with the 8 ms P95 and 16.67 ms maximum interaction targets. Animation-frame callbacks run before paint, browser Long Tasks and Long Animation Frames only report entries at or above 50 ms, and Event Timing censors durations below its 16 ms minimum threshold, so none of these observations alone proves the repository's 8 ms main-thread gate.

## Limits

Measurements use one development machine and headless Chromium. Synthetic `handleKey` calls measure handler work, not native input latency; trusted CDP key input feeds Event Timing but stays censored below 16 ms. No result here selects a store, framework, or final product tree.
