# DH-07: Resilient shell loading and errors

Status: **planned**  
Priority: **P1 — UX and recoverability**  
Primary owner: desktop React shell  
Estimated size: 2–4 focused implementation days

## Outcome

Desktop never replaces the boot splash with an unexplained blank screen. Every lazy route has a stable loading view, route/render failures have a recovery view, native window controls mount exactly once, and fatal errors offer safe actions that work without network access. Save failures remain visible until resolved.

## Why this is required

`router.tsx` uses `Suspense fallback={null}` for five lazy route paths and defines no deliberate root error/pending/not-found views. `main.tsx` removes the splash after two animation frames regardless of whether the shell is ready. `WindowControls` mounts in both `main.tsx` and `AppProviders`, producing duplicate fixed controls and duplicate resize listeners in desktop.

For a writing application, an invisible failure is especially harmful: users cannot tell whether content is loading, saved, or recoverable.

## Read first

- `packages/web-spa/src/main.tsx`
- `packages/web-spa/src/router.tsx`
- `packages/web-spa/index.html`
- `packages/web-spa/src/styles/desktop-chrome.css`
- `apps/web/src/providers/app-providers.tsx`
- `apps/web/src/features/desktop/window-controls.tsx`
- `apps/web/src/features/notes/hooks/use-debounced-save.ts`
- `apps/web/src/features/notes/store.ts`
- `apps/web/src/shared/ui/user-toast-host.tsx`
- `apps/web/src/features/editor/components/editor-container.tsx`
- DH-06 plan, because all new lazy imports use these states

## Locked design decisions

1. Keep exactly one `WindowControls` mount in the desktop entry shell. Remove it from shared `AppProviders` unless a verified non-SPA caller needs it.
2. Loading states preserve the app's main geometry to avoid layout shift: icon rail, content frame, and appropriate route silhouette.
3. A loading state must have an accessible label but should not repeatedly announce progress.
4. The boot splash remains until the React shell has committed a visible ready or visible recovery state.
5. Root errors and route errors have separate recovery scope. A failed route should not destroy the icon rail or settings access when the root shell still works.
6. Recovery works offline and must not depend on telemetry or a web account.
7. Diagnostics must exclude note bodies, API keys, sync tokens, and full filesystem paths unless the user explicitly chooses to copy them.
8. Save errors are persistent state, not transient toasts. Never display “Saved” after a failed mutation until a retry succeeds.
9. Reduced-motion preference applies to skeleton shimmer and transitions.
10. Reusing shared UI primitives is preferred, but the desktop boot error must remain import-light so it can render when feature chunks fail.

## Target shell states

Define explicit states with one visual owner:

```text
booting -> shell-loading -> ready
                    \-> recoverable-route-error
        \-> fatal-shell-error
ready -> save-error -> retrying -> ready
```

Recommended small modules under `packages/web-spa/src/components/`:

- `desktop-route-loading.tsx`
- `desktop-route-error.tsx`
- `desktop-fatal-error.tsx`
- `boot-splash-controller.tsx`

Names may change. Keep their dependency graph small and avoid importing the editor/settings feature trees.

## Implementation phases

### Phase 1: Remove duplicate native chrome

1. Keep `<WindowControls />` in `packages/web-spa/src/main.tsx`, where the desktop entry is explicit.
2. Remove the import and mount from `apps/web/src/providers/app-providers.tsx`.
3. Search for all remaining mounts and assert exactly one in the desktop bundle.
4. Add a stable `data-testid` or semantic selector for behavior tests.
5. Verify minimize, maximize/restore, close hover, keyboard focus, and drag regions on all platforms.

### Phase 2: Splash readiness handshake

1. Replace the unconditional two-frame dismissal in `main.tsx` with an idempotent `markDesktopShellVisible()` function.
2. Call it from a tiny module rendered inside both the root shell's ready/loading frame and fatal error view after commit.
3. Keep a safety timeout only as a last resort; if it fires, show the fatal recovery view rather than blank content.
4. If the splash transition event never fires, remove it after a bounded timeout.
5. Add `aria-hidden="true"` to visual-only splash content and ensure the live React status is announced once.

### Phase 3: Router pending and error views

Use TanStack Router's supported root/route error and pending configuration rather than wrapping every route inconsistently.

1. Add root `pendingComponent`, `errorComponent`, and `notFoundComponent` or the equivalent configuration for the installed version.
2. Replace every `fallback={null}` with `DesktopRouteLoading` or remove local Suspense when router pending handling owns it.
3. Route error view receives the router's reset/retry function.
4. Keep the icon rail and shell frame visible for child-route failures.
5. Not-found view offers “Open notes” and preserves keyboard navigation.
6. Include concise user copy and an expandable technical detail, not a raw stack trace as the primary message.

### Phase 4: Root fatal recovery

Add a lightweight React error barrier outside `RouterProvider` in `main.tsx` for provider/router construction or render failures.

Required actions:

- **Retry:** reset barrier once.
- **Reload Skriuw:** `window.location.reload()`.
- **Reveal vault:** invoke `reveal_vault` when Tauri IPC is available.
- **Copy diagnostics:** app version, platform, route hash, error category/message, and timestamp; exclude content/secrets and sanitize paths.

If IPC itself is unavailable, disable the reveal action and explain that the app shell connection failed.

### Phase 5: Persistent save failure surface

1. Trace `saveStates` and `use-debounced-save` error callbacks.
2. When the active note has `error`, show a persistent non-modal banner near the editor status—not only a toast or console error.
3. Provide **Retry save** and **Copy unsaved text** actions.
4. Keep local editor content mounted during retry.
5. Do not navigate away silently when a note remains in `error`. If navigation is allowed, preserve the draft in memory and show a persistent workspace-level error indicator.
6. On window quit with pending/error writes, attempt the existing flush path and show a native/app confirmation if the flush fails. Do not add blocking confirmation for fully saved state.
7. Journal save errors need the same semantics, even if their visual placement differs.

### Phase 6: Loading visuals

Provide route-specific silhouettes while reusing a compact primitive:

- Notes: sidebar rows plus editor lines.
- Graph: centered canvas status.
- Journal: calendar/sidebar plus writing lines.
- Tasks/activity/tags/people/trash: list rows and heading.

Rules:

- Match final dimensions closely.
- No infinite shimmer under reduced motion.
- Use `role="status"` with one visually hidden label.
- Do not focus the loading view.
- Preserve current scroll/focus when a nested lazy feature loads.

### Phase 7: Local diagnostics

1. Add a small ring buffer for shell-level error metadata only if existing logging does not provide it.
2. Redact values matching known credential/token fields.
3. Do not record note titles or bodies by default.
4. “Copy diagnostics” requires user action and previews or describes included fields.
5. Avoid adding remote crash reporting in this packet.

## Required tests

### Mount tests

- Desktop shell contains exactly one window-controls region.
- Web/shared `AppProviders` renders no native controls outside Tauri.
- Resize listener is registered and removed once.

### Loading/error tests

- Delayed route import shows a non-blank loading view.
- Rejected route import shows route recovery while shell navigation remains.
- Root render throw shows fatal recovery.
- Retry/reset can recover after a one-time failure.
- Unknown route renders not-found view.
- Splash is removed only after loading/ready/error React UI commits.

### Save-error tests

- Failed save produces persistent error state and banner.
- Retry success changes state to saved and removes banner.
- Retry failure retains editor content.
- Copy-unsaved-text uses the current draft.
- Quit with failed flush asks for confirmation; clean quit does not.

### Accessibility tests

- Loading status has one accessible announcement.
- Recovery actions are keyboard reachable in logical order.
- Focus moves to error heading on route/fatal failure and returns sensibly after retry.
- Reduced motion disables shimmer/large transitions.

## Acceptance criteria

- [ ] Exactly one desktop window-control region mounts.
- [ ] No desktop route uses `fallback={null}`.
- [ ] Boot splash remains until visible React loading, ready, or recovery UI commits.
- [ ] Route failures preserve the working shell and offer retry/navigation.
- [ ] Root failures offer retry, reload, reveal vault, and redacted diagnostics where available.
- [ ] Active note and journal save failures remain visibly unresolved until success.
- [ ] Unsaved content remains copyable after a save failure.
- [ ] Loading and recovery states meet keyboard, focus, and reduced-motion requirements.
- [ ] Behavior tests replace or supplement source-text route assertions.

## Verification commands

```bash
rg -n -F 'fallback={null}' packages/web-spa/src apps/web/src
rg -n '<WindowControls' packages/web-spa/src apps/web/src
bun test packages/web-spa/src
bun run --cwd packages/web-spa typecheck
bun run --cwd packages/web-spa build
bun run desktop:check
git diff --check
```

Manual packaged verification:

1. Throttle module loading in development and navigate every route.
2. Use a test-only one-shot route failure and recover.
3. Break Tauri IPC in a disposable build and verify fatal actions degrade safely.
4. Force a save error using a test vault failure hook; copy the draft and retry.
5. Verify window controls and drag/resize on Windows, macOS, and Linux.

## Rollback

Individual skeletons and route barriers are revertible. Keep the duplicate-control removal and non-null fallbacks even if visual polish is rolled back. Never roll back to hiding save errors in the console. A minimal text loading/error view is an acceptable temporary fallback.

## Out of scope

- Remote crash reporting.
- Full visual redesign.
- Performance chunk targets; DH-06 owns them.
- Persistence atomicity; DH-01 owns it.
- External-edit conflicts; DH-08 owns them.

## Agent handoff template

Report:

- Final shell state ownership.
- Window-controls mount location and removed duplicate.
- All route fallbacks/error views.
- Splash readiness handshake.
- Save-error behavior and quit behavior.
- Accessibility and packaged-platform verification results.
