# Renderer store selector spike

This disposable React harness measures fine-grained external-store selectors against the canonical Rust tree projections. It is not the product shell and does not select React, a final store, an editor, or a desktop framework.

## Prepare and build

```bash
cd app/harnesses/renderer-store
./scripts/export-fixtures.sh
bun install --frozen-lockfile
bun run test
bun run build
bun run build:profiling
```

The ordinary production bundle excludes the profiling renderer. The separate profiling build aliases `react-dom/client` to `react-dom/profiling` and writes to `dist-profiling`.

## Inspect

```bash
bunx vite preview --host 127.0.0.1 --port 4175
```

Open `http://127.0.0.1:4175/?fixture=nested-5000`. Available fixtures are `nested-1000`, `nested-5000`, `wide-5000`, and `mixed-5000`.

## Automate ordinary production

```bash
node scripts/bench.mjs http://127.0.0.1:4175 production nested-1000 nested-5000 wide-5000 mixed-5000
```

The script launches one fresh headless Chrome profile per fixture and measures direct selection, expansion, editor-owned input, metadata, equivalent updates, and selector subscription setup/teardown. Each ordinary-production action is enclosed by `flushSync` and a forced layout read so its sample includes selector delivery and the resulting React commit.

It then prepares 34 top, 33 middle, and 33 bottom consecutive-note anchors outside the key timing, sends exactly 100 trusted ArrowDown events through CDP, requires exactly 100 active-note transitions and 100 trace dispatch samples, captures a screenshot, validates lifecycle guards, and exits after browser cleanup.

Five fresh nested-5000 repetitions:

```bash
for run in 1 2 3 4 5; do
  node scripts/bench.mjs http://127.0.0.1:4175 "nested-repeat-$run" nested-5000
done
```

## Automate profiling production

```bash
bunx vite preview --outDir dist-profiling --host 127.0.0.1 --port 4176
node scripts/bench.mjs http://127.0.0.1:4176 profiling nested-1000 nested-5000 wide-5000 mixed-5000
```

Machine-readable JSON and screenshots are written to ignored `results/`. These artifacts are local exploratory evidence, not committed fixed-runner evidence.

## Contract

- The normalized store owns stable node records, parent-to-child indices, visible IDs, expansion, disabled nodes, active note, tree focus, prepared-document identities, metadata, and minimal settings selection.
- Selector callbacks fire only when their selected result changes. Equivalent state returns before selector traversal.
- The application shell has no workspace subscription. The tree host subscribes only to visible IDs; mounted rows subscribe only to their own active, focus, expansion, and disabled flags.
- One persistent editor host contains the active prepared-document consumer. Editor typing mutates only the editor-owned surface.
- Metadata fields subscribe independently. The unrelated settings consumer does not render during navigation, tree, editor, or metadata scenarios.
- Navigation uses only synchronous renderer memory. Fixture fetch, JSON parsing, index construction, and code loading finish before automation is exposed.
- Keyboard navigation and measured high-frequency actions have no animation.

Function-body render counters are profiling diagnostics only and never drive UI or state. Leaf and root React Profiler commit counts are the committed-render evidence. Ordinary-production settled-action timing, CDP trace dispatch, pre-paint frames, Event Timing, Long Tasks, and Long Animation Frames remain distinct measurements.
