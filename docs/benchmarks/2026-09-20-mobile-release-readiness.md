# Mobile release readiness: performance evidence, 2026-09-20

Evidence for the mobile client against `docs/performance-contract.md` and the
performance requirements in `docs/specs/mobile-app.md` (R-P1 to R-P4), taken at
the point where Mobile 01 to Mobile 15 are on `daddy`.

**The reference-device run has not happened.** Every number here comes from a
development host: the shared TypeScript layer under Node, and the React Native
Web export under headless Chrome. They bound the work the shell asks for per
interaction and they settle the store-level invariants outright, but they
measure no Android frame, no iOS anything, and no native SQLite. The reasons
are in [Not measured, and why](#not-measured-and-why), and the R-P4 budget is
consequently **unverified**, not met.

## Environment

- Linux 7.1.2-arch3-1 x86_64; Intel Core i7-10700F at 2.90 GHz.
- Node 24.21.0, Bun 1.4.2, Chrome 150.0.7871.46 (`--headless=new`).
- `mobile/` at `feat/mobile-16-release-readiness-performance-evidence`, cut
  from `daddy` after Mobile 15 (PR #414). Mobile 11's search surface is
  reviewed but unmerged (PR #413), so no `/search` route was exercised.
- Harness and reproduction commands:
  [`harness/README.md`](harness/README.md). Raw samples in
  [`raw/2026-09-20-mobile-scale-1000.json`](raw/2026-09-20-mobile-scale-1000.json),
  [`raw/2026-09-20-mobile-scale-5000.json`](raw/2026-09-20-mobile-scale-5000.json),
  [`raw/2026-09-20-mobile-web-audit.json`](raw/2026-09-20-mobile-web-audit.json).

## Workload

`harness/mobile-scale.mts` builds the two workspace fixtures the performance
contract names — 1,000 and 5,000 notes over a nested folder tree, 40 blocks per
ordinary note, plus one note each at the 50-, 500- and 2,000-block fixture
sizes — hands them to the in-memory bridge adapter, and then drives the real
mobile startup path: `bootstrapWorkspace`, `createInitialState`,
`createRendererStore`, one phone viewport of `treeRowSelector` subscriptions
using the shell's own `treeRowsEqual` and `idListsEqual`, and a live
`createEditorHostSession` with a fake webview on the other end. Every bridge
call is counted through a proxy, so "no bridge call during navigation" is
asserted rather than assumed.

The fixture snapshots are 10.3 MB (1,000 notes) and 49.1 MB (5,000 notes) of
JSON.

## Results: shared shell layer

| Measurement | 1,000 notes | 5,000 notes |
| --- | ---: | ---: |
| Bootstrap snapshot read | 0.85 ms | 1.12 ms |
| Store hydration (normalize, index, flatten) | 5.31 ms | 10.67 ms |
| **Startup total, adapter to rendered tree model** | **6.16 ms** | **11.79 ms** |
| Cached note switch, P50 | 0.024 ms | 0.098 ms |
| Cached note switch, P95 | 0.066 ms | 0.137 ms |
| Cached note switch, max over 100 | 0.700 ms | 0.815 ms |
| Bridge calls across 100 switches | **0** | **0** |
| Shell selector notifications per switch | 0.04 | 0.02 |
| Tree expand/collapse, P95 | 0.052 ms | 0.320 ms |
| Editor `change` handling, P95 | 0.008 ms | 0.007 ms |
| Shell selector notifications across 60 changes | **0** | **0** |
| Synchronous bridge calls across 60 changes | **0** | **0** |

Each column is one process, one sample per measurement except where a count is
given. Repeating the 1,000-note run moved the startup total between 2.8 ms and
6.2 ms — JIT warm-up and garbage collection on a shared development host, and
a reason to read these as an order of magnitude rather than as a baseline. The
counted invariants (bridge calls, selector notifications) were identical on
every repetition.

Editor `load` message encoding — the serialization the Expo DOM component
imposes on every note switch, measured on the 5,000-note run:

| Document | Encoded size | P50 | P95 | Max |
| --- | ---: | ---: | ---: | ---: |
| 50 blocks | 11.9 KB | 0.020 ms | 0.023 ms | 0.032 ms |
| 500 blocks | 116.6 KB | 0.177 ms | 0.190 ms | 0.204 ms |
| 2,000 blocks | 465.5 KB | 0.894 ms | 0.927 ms | 1.036 ms |

## Results: React Native Web export

`harness/mobile-web-audit.mjs` serves the static `expo export --platform web`
output at 390 × 844 with DPR 3 and touch emulation, and records on the first
animation frame where the tab bar, the toolbar's tree control and the note
heading are all present.

| Measurement | Value |
| --- | ---: |
| Cold start to operable shell, P50 over 10 loads | 81.4 ms |
| Cold start to operable shell, min | 74.0 ms |
| Cold start to operable shell, max (first load, cold JIT) | 207.0 ms |
| Web bundle, unminified single chunk | 2.4 MB |
| Console errors across six routes and two overlays | 0 |

This is the demo workspace (8 notes), not a scale fixture: the web export
hard-codes `demoSnapshot()` and there is no seam to hand it a larger one
without changing `mobile/src/shell`, which Mobile 16 does not own.

## Verdict per requirement

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| **R-P1** Navigation waits on nothing after startup | **Met at the shell layer** | 0 bridge calls across 100 cached switches at both fixture sizes; the only two startup calls are `bootstrapWorkspace` and `loadSidebarExpansion` |
| **R-P2** One warm webview, never remounted on navigation | **Met by construction, unmeasured on device** | Every switch produces exactly one `load` message from a session that is created once; the harness holds no webview, so remounting is proven by the protocol, not by a device |
| **R-P3** Typing causes no render outside the editor host and no synchronous native call | **Met at the shell layer** | 0 shell selector notifications and 0 synchronous bridge calls across 60 `change` messages; the 60 durable submissions all land on the queue afterwards, one per change (ADR-0012) |
| **R-P4** Cold start to interactive tree, 1.5 s P95, reference Android device, 1,000-note fixture | **Unverified** | No Android run. The host analogue is 6.2 ms of hydration and 81 ms to an operable React Native Web shell; neither is the budget's subject |
| Cached editor-state swap, P95 < 8 ms | **Unverified on device; 0.066 ms of shell work** | The swap is the webview's, and the webview was not measured |
| Keystroke to paint, P95 < 8 ms | **Unverified** | Paint happens inside the editor webview, which no host driver renders |
| Dropped frames across 100 cached switches | **Unverified** | Neither driver produces frame timing |

## Not measured, and why

- **Reference Android device and emulator.** The host has under 3 GB free of 911 GB.
  `mobile/modules/skriuw-core/e2e/run-android.sh` gets through `expo prebuild`,
  the Metro bundle and `app:assembleRelease`, and then `adb install` fails: the
  AVD's `/data` is full and the emulator will not boot with a larger
  `-partition-size` either. No physical device is attached (`adb devices` is
  empty). Freeing the disk — `~/.android/avd/ExpoAVD.avd.bak` alone is 10 GB —
  is the whole fix, and it is the user's data to remove, not this branch's.
- **iOS.** iOS cannot be built or simulated on Linux (ADR-0048). The route to
  evidence is EAS, and EAS is blocked on three things recorded against Mobile
  10 (#391): no `expo.extra.eas.projectId`, no `EXPO_TOKEN`, and gitignored
  Rust libraries that EAS workers never receive. **iOS is unverified in every
  respect.**
- **Frame timing and React commit counts.** The performance contract's frame
  budgets want a production build on fixed reference hardware with Long
  Animation Frame observations. Neither driver here produces one.

## Interpretation

The architecture's own claim — that navigation is a synchronous store read and
that typing never leaves the editor — holds at the layer where it can be
falsified cheaply, and it holds with room to spare: the entire shell cost of
switching a note in a 5,000-note workspace is 0.14 ms at P95, some fifty times
under the 8 ms budget the whole frame has to fit into. Hydration grows
roughly linearly with workspace size (5.3 ms → 10.7 ms for 5× the notes), which
leaves the 1.5 s cold-start budget almost entirely to the parts nobody has
measured yet: React Native's own start, the native module, opening SQLite and
reading the snapshot out of it.

That is the honest shape of this evidence. It removes the shared layer as a
suspect; it does not tell you whether the product meets R-P4. Until an Android
run exists, the mobile client has no release-grade performance verdict, and
this document should not be cited as one.
