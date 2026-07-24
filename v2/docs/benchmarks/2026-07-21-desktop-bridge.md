# Desktop bridge measurement

Date: 2026-07-21

## Question

Can a Tauri command adapter submit work to the existing serialized storage runtime, wait away from the renderer and Tauri UI threads, and keep navigation entirely renderer-local?

## Harness

`spikes/desktop-bridge` is an isolated Tauri 2.11.5 application with a Vite 8.1.5 production frontend running in the Linux WebKit system WebView. Its Rust command owns the existing `WorkspaceRuntime` over an in-memory `WorkspaceStorage` fixture.

The async runtime command submits `search` immediately and moves only `Completion::wait` into `tauri::async_runtime::spawn_blocking`. This preserves the runtime's submission order without blocking the WebView or Tauri UI thread. The command returns the original request identity and response byte count.

The frontend measures:

1. 1,000 synchronous local note-selection projections with command counters around the loop.
2. 200 sequential empty echo commands after 20 warmups.
3. 200 sequential 1 KiB echo commands after 20 warmups.
4. 100 sequential 64 KiB echo commands after 20 warmups.
5. 200 sequential commands through Tauri and `WorkspaceRuntime` after 20 warmups.
6. 100 optimistic local updates whose runtime acknowledgements remain in flight together.

The optimistic fixture sleeps one millisecond for each request on the serialized storage worker. It deliberately creates about 100 milliseconds of acknowledgement pressure. This is a UI-thread responsiveness probe, not representative storage work.

## Environment

- Rust 1.95.0 release build with the repository release profile inherited only by workspace crates; the isolated Tauri crate uses Cargo's release defaults.
- Tauri 2.11.5, Tauri runtime 2.11.3, Wry 0.55.1, WebKitGTK 2.52.4, GTK 3.24.52.
- Vite 8.1.5, TypeScript 7.0.2, `@tauri-apps/api` 2.11.1.
- User agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15`.
- Development machine and active graphical session; no fixed performance runner.

## Five-run observations

Values below are medians across five fresh application launches. Throughput mean is aggregate elapsed time divided by operation count. Individual sub-millisecond samples are censored by the WebView's approximately one-millisecond timer resolution.

| Scenario | Median observation |
| --- | ---: |
| 1,000 local navigation updates | 1.0 ms total, zero bridge commands |
| Empty echo IPC | 0.220 ms throughput mean |
| 1 KiB echo IPC | 0.180 ms throughput mean |
| 64 KiB echo IPC | 0.420 ms throughput mean |
| IPC plus serialized runtime completion | 0.215 ms throughput mean |
| Queue 100 optimistic actions | 7.0 ms total, 1.0 ms per-action P95 |
| Settle 100 delayed acknowledgements | 107 ms total, 96 ms acknowledgement P95 |
| Frames during delayed acknowledgements | 16 ms median maximum gap, zero dropped frames |

All five runs kept exact FIFO acknowledgement order. The largest frame gap across the five runs was 17 ms. Every run reported zero dropped frames using 1.5 times its observed median frame interval as the threshold.

## Interpretation

The bridge does not belong in navigation. The counter invariant proves the measured navigation loop issued no IPC, while 1,000 local projections completed in one to two timer milliseconds across all runs.

For background persistence, Tauri command overhead is small relative to a frame and relative to durable storage work. Passing through the actual runtime queue did not materially increase aggregate empty-fixture throughput. A 64 KiB payload roughly doubled the empty-command throughput cost but remained below half a millisecond per operation in the recorded medians.

The delayed burst is the architectural proof: acknowledgements can wait roughly 100 milliseconds in FIFO storage order while local dispatch completes inside one frame and the WebView continues presenting frames. Product adapters should update renderer state first, submit the operation without awaiting it in the interaction handler, and process revision acknowledgements later.

## Limits

- These are exploratory development-machine measurements, not fixed-runner performance gates.
- WebKit timer quantization prevents a trustworthy sub-millisecond percentile claim.
- The storage fixture does not measure SQLite, filesystem, Git, command deserialization into final operation envelopes, startup bootstrap payloads, or error serialization.
- `requestAnimationFrame` is a presentation opportunity, not proof that every frame reached the display.
- The harness measures Linux WebKitGTK only. Windows WebView2 and macOS WKWebView require platform runs before shell selection is final.
- The result keeps Tauri viable; it does not select Tauri or authorize product shell scaffolding.
