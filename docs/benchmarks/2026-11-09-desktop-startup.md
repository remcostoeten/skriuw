# Desktop startup

Date: 2026-11-09

Decision: [ADR-0061](../adr/0061-early-workspace-read-and-deferred-raw-editor.md)

Revisions: `perf/faster-desktop-startup` against its base `9fb437153` (#572).

Reference machine: `remcostoeten`, Intel Core i7-10700F, 16 logical CPUs,
15.5 GiB RAM, NVIDIA GPU, Arch Linux 7.2.9, WebKitGTK 2.54.1, KWin 6.7.5.

## Method

Both revisions were built with `cargo tauri build --no-bundle` after applying
the same temporary timing patch, which is not committed. The patch records a
timestamp at `main()` in Rust and at window reveal, and from the renderer at
bundle evaluation, store ready, the `root.render` call and the second
animation frame after it ("painted"). Renderer timestamps are taken with
`performance.timeOrigin + performance.now()` and sent with the mark, so a busy
shell thread cannot delay them.

Each launch ran under a fresh headless compositor
(`kwin_wayland --virtual --width 1600 --height 1000`) with `GDK_BACKEND=wayland`,
against a copy of a real 582-note workspace (15 MB database, 4.2 MB bootstrap
snapshot) set through `SKRIUW_DB` and `XDG_DATA_HOME`. The session bus was
pointed at a missing socket so cloud sync could not start. The two binaries
alternated for 12 launches each between 11:11 and 11:15, at a load average of
2.8 to 4.9. Earlier runs at a load average near 20 are not used.

## Results

Milliseconds after `main()`, median of 12 launches.

| Phase | Before | After |
| --- | --- | --- |
| Window revealed with splash | 590 | 552 |
| Bundle evaluated | 701 | 668 |
| Store ready | 824 | 711 |
| Render start | 942 | 721 |
| Painted | 1387 | 1396 |

Painted per launch, before: 1278 to 1584. After: 1272 to 1509.

The main chunk no longer contains CodeMirror, vim or the Lezer parsers; they
load in a separate chunk.

## Remaining cost

The snapshot is ready and the first render starts earlier, but render start to
painted grows by the same amount. After the snapshot arrives the main thread
runs one task of about 250 ms that is not part of any startup step. It moves
between the bindings, the first render and just after the paint from launch to
launch, and it stays with accelerated compositing disabled and with the raw
editor chunk not loaded. JavaScript garbage collection stayed below 15 ms per
cycle (`JSC_logGC=1`), so it is not the cause. Identifying it needs a WebKit
profiler session.
