# Preload algorithm: adaptive prefetch for backlinks and recents

> Status: design proposal. Depends on the data-layer split described in
> `right-path.md` (metadata vs per-note content endpoints). The chip
> feature works today on the eager-loaded layer; this doc describes how
> to make navigation feel instant *after* we stop shipping every note up
> front.

## Goal

The user clicks a note-link chip → the target appears with no spinner,
no flash of empty editor. To do that without preloading every note we
need a small algorithm that decides, per active note, *which other notes
are likely to be opened next* and prefetches their content.

Inputs we already have:

- The full set of outgoing links from the active note
  (`buildNoteLinkIndex` → `outgoing`).
- The full set of incoming links (`backlinks`).
- The tag set of the active note.
- A per-note `lastOpenedAt` (we'd need to track this; trivially cheap).

Inputs we can sample at runtime:

- Network condition (`navigator.connection.effectiveType`, `saveData`,
  `downlink`).
- Battery / power-save (`navigator.getBattery()` if exposed).
- Device memory (`navigator.deviceMemory`).
- Idle vs active (`requestIdleCallback`).

## Tier 0 — naive baseline (ship first)

> "At least preload all backlinks on the relative note." — the user.

When the active note becomes active:

1. Build the link index.
2. Collect `{outgoing.targetNoteId, backlinks.sourceNoteId}` (resolved
   only). Deduplicate.
3. Schedule a `requestIdleCallback` (fallback `setTimeout(fn, 200)`) that
   fires `queryClient.prefetchQuery({ queryKey: ['note', id] })` for each
   target.
4. Cap concurrency (e.g. 4 in-flight prefetches) and total per-activation
   budget (e.g. 25 notes — enough for typical link density, far less than
   1k).
5. Cancel pending prefetches when the active note changes (use an
   `AbortController` per activation).

This alone gets us "click backlink → instant editor" for the common case
(a note's neighbors in the link graph). It is also the floor that every
later tier builds on.

## Tier 1 — score and rank

Not every neighbor deserves prefetch. Cheap scoring:

```
score(target) =
    w_direct  * directLink(active, target)         // 0/1
  + w_back    * backlink(active, target)           // 0/1
  + w_recent  * recencyDecay(target.lastOpenedAt)  // exp decay over days
  + w_tags    * jaccard(active.tags, target.tags)  // 0..1
  + w_pair    * coOpenFrequency(active, target)    // pair-open log
```

`coOpenFrequency` requires a tiny client-side log: when the active note
changes, append `{from, to, ts}`. Aggregate per `(from, to)` pair with a
30-day window. Stored in IndexedDB (or sessionStorage for v0). This is
the only "learned" component — it's just empirical co-navigation, no ML.

Weights start as constants we hand-tune; they can later be lifted into a
small per-user table once we have data.

Prefetch the top-N by score, with N modulated by network tier (below).

## Tier 2 — network-aware budget

```
function prefetchBudget(): { count: number; concurrency: number } {
  const conn = navigator.connection;
  if (!conn) return { count: 12, concurrency: 4 };           // unknown, assume desktop wifi
  if (conn.saveData) return { count: 0, concurrency: 0 };    // user opted out
  switch (conn.effectiveType) {
    case "slow-2g":
    case "2g":  return { count: 0, concurrency: 0 };
    case "3g":  return { count: 4, concurrency: 1 };
    case "4g":  return { count: 16, concurrency: 4 };
    default:    return { count: 32, concurrency: 6 };        // 5g / wired
  }
}
```

Refinements:

- Listen to `navigator.connection.addEventListener("change", ...)` —
  re-evaluate budget mid-session if the user switches from wifi to
  cellular.
- Multiply budget by `0.5` if `navigator.deviceMemory <= 4`.
- Multiply budget by `0` if power-save mode is on (`(await
  navigator.getBattery()).charging === false && level < 0.2`).

## Tier 3 — hover / focus prefetch

A user moving the cursor toward a chip is a *much* stronger signal than
graph proximity. Wire `onPointerEnter` and `onFocus` on each chip to
trigger an immediate `prefetchQuery` (bypass the budget — hover is cheap
and intent is explicit). This is the single highest-ROI addition once
the data split lands.

## Tier 4 — eviction

Prefetched notes live in the react-query cache. Without bounds we end up
holding everything anyway. Bound the per-id cache:

- `gcTime: 5 * 60_000` for prefetched notes (5 min idle → evict).
- `gcTime: Infinity` for the active note while it stays active.
- Hard LRU cap: keep the last N opened notes resident, evict beyond.

## Telemetry to validate

Emit (locally first, no remote):

- `prefetch.hit` — user opened a note that was already cached.
- `prefetch.miss` — user opened a note we hadn't prefetched.
- `prefetch.waste` — prefetched note that was never opened before
  eviction.

Goal: hit-rate > 80% on the active session, waste-rate < 30%. Tune
weights / budget against those.

## What we are NOT doing (yet)

- ML model. The signal is weak and the volume is tiny per user. Hand-
  tuned scoring + co-open frequency gets us 90% of the value.
- Server-side recommendations. Adds latency and complexity. Revisit if
  multi-device sync ever needs a shared "what's hot" view.
- Speculative `getNote` on hover-over sidebar items. Cheap to add but
  noisy — gate behind a setting.

## Sequencing

1. Land the metadata/content split (`right-path.md`).
2. Tier 0 (preload all neighbors of active note) — 1 day of work,
   immediate UX win.
3. Add hover prefetch (Tier 3) — half a day, biggest perceived speedup.
4. Tier 1 scoring + co-open log — 2 days, makes Tier 0 honest under
   high link-density.
5. Tier 2 network adaptation — 1 day, mostly defensive.
6. Tier 4 eviction + telemetry — 1 day, prevents regressions.

Total ~1 week behind the data split, fully shippable in slices.
