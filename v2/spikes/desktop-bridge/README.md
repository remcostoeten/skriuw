# Desktop bridge spike

This disposable production harness measures a Tauri 2 command boundary against the real `skriuw-runtime` queue without selecting or scaffolding the product desktop shell.

## Run

```bash
cd spikes/desktop-bridge
pnpm install --frozen-lockfile
./scripts/bench.sh
```

Set `SKRIUW_BRIDGE_SKIP_BUILD=1` only after an exact production frontend and release Rust build already exist. The script launches the native WebKit application, waits for a result written through an isolated temporary file, prints the raw JSON, terminates the application, and removes its temporary files.

## Contract

- One thousand renderer-local navigation updates execute without calling the desktop bridge. Command counters before and after must be equal.
- Empty, 1 KiB, and 64 KiB echo commands isolate request/response serialization and transport cost.
- Runtime round trips submit work to the real serialized `WorkspaceRuntime` and move only the blocking completion wait onto Tauri's blocking pool.
- One hundred optimistic actions update renderer state before invoking the runtime command. Acknowledgements must resolve in FIFO order.
- The optimistic storage fixture deliberately waits one millisecond per item on the storage worker. This creates roughly 100 milliseconds of serialized completion pressure so animation frames can prove that renderer and Tauri UI threads remain available while acknowledgements wait.
- Raw per-operation samples, total elapsed time, throughput mean, P50, P95, P99, maximum, frame gaps, dropped-frame diagnostics, command counts, and acknowledgement order are returned.

## Limits

The Linux system WebView exposes `performance.now()` at approximately one-millisecond resolution, so sub-millisecond per-call percentiles are censored. Aggregate elapsed time divided by operation count is the more useful throughput estimate. The memory storage fixture isolates bridge and runtime scheduling rather than SQLite, filesystem, or Git cost. The artificial one-millisecond delay is a responsiveness probe, not a storage forecast. Measurements use one development machine and no fixed runner. Tauri remains a candidate until ADR-0020.
