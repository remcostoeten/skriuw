# DH-06: Desktop startup and bundle reduction

Status: **planned**  
Priority: **P1 — performance**  
Primary owner: desktop SPA performance  
Estimated size: 3–6 focused implementation days

## Outcome

The initial desktop workspace becomes interactive with substantially less JavaScript parsing and execution. Settings, AI management, diagrams, graph tooling, syntax highlighting, authentication surfaces, and other non-startup features load only when requested. CI measures the transitive initial route, not merely individual output filenames, and blocks regressions.

## Audit baseline

Production build on 17 July 2026:

| Asset                         |    Minified |      Gzip |
| ----------------------------- | ----------: | --------: |
| Main `index` JavaScript chunk | 2,105.81 KB | 538.52 KB |
| Editor chunk                  | 1,572.07 KB | 481.95 KB |
| Shiki chunk                   | 1,737.60 KB | 373.80 KB |
| `subset-shared` chunk         | 1,823.60 KB | 736.90 KB |
| Main CSS                      |   417.93 KB |  61.59 KB |

These filenames are content-hashed and will change. The implementation must generate a machine-readable baseline from Vite's manifest rather than hard-coding filenames.

## Read first

- `packages/web-spa/vite.config.ts`
- `packages/web-spa/src/main.tsx`
- `packages/web-spa/src/router.tsx`
- `packages/web-spa/index.html`
- `apps/web/src/providers/app-providers.tsx`
- `apps/web/src/features/notes/components/notes-layout.tsx` and its direct imports
- `apps/web/src/features/settings/components/settings-modal.tsx`
- `apps/web/src/features/editor/components/preload-rich-text-editor.ts`
- `apps/web/src/features/notes/components/workspace-graph.tsx`
- `scripts/track-build.sh`
- DH-05 verification script

## Dependency

Prefer DH-05 first so measurements run in CI. This packet may add the bundle measurement script and hand it to DH-05 if sequencing requires it.

## Locked design decisions

1. Optimize startup based on the manifest's transitive imports for the `index.html` entry and default `/app` route.
2. Large lazy chunks are not automatically failures. Budget initial transfer/execution separately from on-demand feature chunks.
3. Preserve offline operation: every lazy asset is bundled locally, not fetched from a CDN.
4. Preserve the current boot splash and local fonts; first paint must not wait on the network.
5. Do not delay the active note body or editor code so aggressively that time-to-edit regresses. Measure both initial shell and first editable note.
6. No feature may disappear from desktop. Capability gating remains unchanged.
7. Do not add speculative `useMemo`, `memo`, or manual chunk rules without measurement.
8. Avoid a single “vendor” chunk that forces unrelated features into startup.
9. Every new lazy route has a visible fallback and recovery view from DH-07.
10. Establish no-regression budgets from a reviewed baseline, then ratchet them downward after improvements.

## Measurement design

Enable `build.manifest: true` in the desktop Vite configuration. Add `scripts/check-desktop-bundle.ts` that:

1. Reads `packages/web-spa/dist/.vite/manifest.json`.
2. Finds the HTML/application entry.
3. Traverses static `imports` recursively, deduplicating files.
4. Separately records `dynamicImports` without charging them to startup.
5. Reads raw byte sizes and calculates gzip sizes using Bun/Node zlib.
6. Separates JavaScript, CSS, fonts, and other assets.
7. Prints the largest contributors and a JSON report suitable for CI artifacts.
8. Compares metrics with explicit thresholds in a committed budget file, such as `packages/web-spa/bundle-budget.json`.
9. Exits non-zero with measured and allowed values on regression.

Record at least:

- Static initial JS raw/gzip.
- Static initial CSS raw/gzip.
- Number of initial JS requests/chunks.
- Largest static initial chunk.
- Total lazy JS raw/gzip as informational.
- Named heavy feature groups when identifiable.

## Performance targets

Before code splitting, commit the exact measured transitive baseline. Then achieve all of:

- At least 25% reduction in static initial JavaScript gzip from that baseline.
- No increase in first-editable-note median time on the same machine and test vault.
- Settings, graph, AI settings, diagram builder, and syntax-highlighting implementation absent from the initial static graph unless required by the default visible note.
- No route transition displays blank content.
- Subsequent opens of an already loaded feature remain immediate through browser cache/module cache.

After improvement, set CI thresholds no more than 5% above the new measured result to tolerate toolchain noise while preventing backslide.

## Implementation phases

### Phase 1: Capture an honest baseline

1. Add the Vite manifest and measurement script.
2. Build twice from a clean `dist` and confirm stable totals.
3. Save JSON results under an intentional docs/artifact path, not generated `dist`.
4. Inspect the entry's static dependency graph. Do not infer startup solely from the largest build output list.
5. Add lightweight runtime marks in development:
    - `performance.mark("skriuw:boot-script")`
    - React root mounted
    - shell visible
    - active note loaded
    - editor editable
6. Add a Playwright/browser measurement harness against Vite preview if native automation is not yet stable.

### Phase 2: Remove obvious eager mounts

1. `router.tsx` currently imports and always mounts `SettingsModal`. Replace it with a small lazy mount triggered only when settings first opens, while preserving command/shortcut behavior.
2. Audit `AppProviders` eager imports:
    - `DesktopCloudSync`
    - global command palette
    - quick switcher/access
    - pending collaboration replay
    - authentication UI hosts
    - development tools
3. Keep tiny providers eager when lazy indirection costs more than it saves. Measure each change.
4. Ensure desktop-disabled capabilities do not statically import their full implementations.
5. Remove the duplicate `WindowControls` mount as part of DH-07, not through a performance-only workaround.

### Phase 3: Route-level splitting

Convert every non-default route implementation to `lazy` with named fallback/error handling:

- Graph
- Journal, if not required at startup
- Tasks
- Trash
- Activity
- Tags overview/detail
- People overview/detail

`router.tsx` currently lazy-loads some but statically imports others. Verify the build manifest after each group. Route metadata and tiny adapters may remain eager.

### Phase 4: Heavy feature splitting

1. Keep BlockNote/editor code out of shell startup until an active note needs it, but preserve the existing priority preload for the likely active note.
2. Load Shiki only when a code block needs highlighting or during idle time after the editor is ready.
3. Load Mermaid/diagram builder only when a diagram block enters edit/view scope.
4. Load force-graph/Cytoscape only on graph routes.
5. Load image reduction only when an image upload begins.
6. Load AI settings and provider-specific UI only when the desktop AI settings section opens.
7. Inspect language/diagram implementation chunks such as `percentages` and `subset-shared`; identify the importing feature before changing manual chunks.

### Phase 5: Manual chunk policy cleanup

1. Review current `manualChunks` rules for editor, graph, and Shiki.
2. Keep a rule only if it improves cache reuse or prevents a measured eager dependency.
3. Do not force all ProseMirror/editor packages together if it creates a monolith that blocks useful incremental loading.
4. Add a short comment for every retained rule describing the measured reason.
5. Resolve the warning where `shortcut-help-dialog.tsx` is both static and dynamic by making ownership consistent.

### Phase 6: Prefetch strategy

1. Default route may preload the rich editor for the last active note as it does today.
2. Use intent preloading for route navigation and settings controls.
3. After editor editable and main thread idle, optionally preload the most likely next feature.
4. Respect reduced-data intent if exposed by the runtime, though all assets are local.
5. Avoid `Promise.all` preloading of every heavy feature.

### Phase 7: Runtime validation

Measure at least 20 cold launches on one fixed machine and disposable vault:

- Empty vault.
- 250-note vault with representative rich content.
- Last-active note containing no code/diagram.
- Last-active note containing code and diagram blocks.

Capture median and p95 for shell visible and editor editable. Record machine, build mode, and methodology in the plan handoff.

## Required tests

- Bundle traversal correctly includes recursive static imports once.
- Dynamic imports are reported but excluded from static startup total.
- CSS imported by static chunks is counted.
- Deliberately lower budget fails with clear output.
- Settings and every lazy route remain keyboard-accessible.
- Offline packaged build can open every lazy feature.
- Route import failure renders DH-07 recovery UI.
- Active note becomes editable and autosave still works.

## Acceptance criteria

- [ ] Vite emits a manifest and CI produces a transitive bundle report.
- [ ] A committed reviewed budget blocks more than 5% regression from the improved baseline.
- [ ] Static initial JS gzip is at least 25% below the pre-change baseline.
- [ ] First-editable-note median does not regress.
- [ ] Settings, graph, AI settings, diagram, and syntax implementation are lazy when not needed.
- [ ] No lazy transition has a null/blank fallback.
- [ ] Offline packaged navigation loads every feature.
- [ ] The static/dynamic import warning for shortcut help is resolved.
- [ ] Performance methodology and before/after results are documented.

## Verification commands

```bash
rm -rf packages/web-spa/dist
bun run --cwd packages/web-spa build
bun scripts/check-desktop-bundle.ts
bun test packages/web-spa/src
bun run desktop:check
git diff --check
```

Do not commit `dist`. The first command is safe only for the generated ignored directory shown above; verify the exact path before running it.

## Rollback

Revert individual lazy splits that measurably worsen time-to-edit or reliability while retaining manifest measurement and no-regression budgets. Do not “fix” a regression by raising the budget without documented review. Because bundle structure is not persisted user data, code splitting is independently revertible.

## Out of scope

- Rust binary/installer size optimization.
- Editor rendering micro-optimizations after load.
- Network/CDN delivery.
- Removing product features.
- Broad React rewrites unrelated to measured startup imports.

## Agent handoff template

Report:

- Initial static dependency graph and top contributors.
- Exact before/after raw and gzip totals.
- Cold-launch methodology and median/p95 results.
- Every feature made lazy and its fallback.
- Final budget values and allowed tolerance.
- Any large static dependency that remains and why it is startup-critical.
