# Mobile measurement harness

Two drivers behind the mobile release evidence in
[`../2026-09-20-mobile-release-readiness.md`](../2026-09-20-mobile-release-readiness.md)
and [`../2026-09-20-mobile-accessibility.md`](../2026-09-20-mobile-accessibility.md).

| Driver | Measures | Runtime |
| --- | --- | --- |
| `mobile-scale.mts` | Startup hydration, cached note switching, editor `load` encoding, tree expansion and the change path, at 1,000 and 5,000 notes | Node, shared TypeScript layer only |
| `mobile-web-audit.mjs` | Cold start to an operable shell, and the accessible role, name and touch target of every control on every route and overlay | Headless Chrome over the React Native Web export, 390 × 844 at DPR 3 |

```bash
bun x tsx docs/benchmarks/harness/mobile-scale.mts --notes 1000
bun x tsx docs/benchmarks/harness/mobile-scale.mts --notes 5000

# The web export needs `expo.web.bundler = "metro"`, which mobile/app.json does
# not set; add it for the export and take it back out afterwards.
mobile/node_modules/.bin/expo export --platform web \
  --output-dir /tmp/skriuw-mobile-web --clear
node docs/benchmarks/harness/mobile-web-audit.mjs --dir /tmp/skriuw-mobile-web --runs 10
```

Both write raw samples into [`../raw`](../raw).

## What these are not

Neither driver is the reference-device verdict the performance contract asks
for. `mobile-scale.mts` runs the shared store, the tree selectors and the
editor host session on a development host with no React Native renderer, no
native module and no SQLite — so it bounds the work the shell asks for per
interaction and proves the store-level invariants (no bridge call during
navigation, no shell subscriber woken by a keystroke), but it produces no
frame timing. `mobile-web-audit.mjs` runs React Native Web, which shares the
shell's components, accessibility props and computed sizes but none of its
native views, so it can show a control that is too small or unnamed and cannot
show how VoiceOver or TalkBack announce it.

`docs/performance-contract.md` budgets are met on the reference Android device
with the 1,000 and 5,000-note fixtures, or they are not met. That run is still
outstanding; see the readiness document for why.

## Where this code belongs

These drivers measure `mobile/`, so they belong beside the code they drive —
`apps/mobile/e2e/`, next to `apps/mobile/modules/skriuw-core/e2e`. They live here because
Mobile 16 owns `docs/benchmarks` and not `mobile/`. Moving them, and wiring the
scale driver into `scripts/check-mobile.sh` as a budget gate, is a follow-up
for whoever next owns `mobile/`.
