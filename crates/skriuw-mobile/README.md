# skriuw-mobile

The UniFFI facade the native mobile shell calls the shared Skriuw core
through. Architecture decision: ADR-0048, implementation contract
`docs/specs/mobile-app.md`, requirements R-A1 and R-A3. Both documents land on
`daddy` with the epic's documentation branch; until then they are only on
`docs/v2-mobile-epic`, which is why neither is linked here.

## Surface

One object and one free function, exported with the UniFFI proc macros:

| Call | Payload |
| --- | --- |
| `MobileWorkspace::open(directory)` | caller-supplied directory; the core never picks a location |
| `bootstrap()` | `WorkspaceSnapshot` JSON |
| `submit_operations(operations_json)` | `Vec<WorkspaceOperationEnvelope>` JSON in, `OperationAck` JSON out |
| `load_document(note_id)` | `WorkspaceDocument` JSON |
| `save_document(request)` | `OperationAck` JSON |
| `shutdown()` | — |
| `database_path()` | the workspace file, for the recovery surface |
| `workspace_protocol_version()` | the protocol the core speaks |

Payloads cross the boundary as the existing generated-contract JSON, so the
mobile client consumes the same schema the desktop and browser runtimes do and
no second contract exists. `save_document` derives the word count with
`skriuw_domain::count_words` rather than trusting the caller, so a mobile
client cannot drift from desktop.

`shutdown` is not called `close`: UniFFI already gives every object an
`AutoCloseable.close` in Kotlin, and a second one is a conflicting overload.

## Properties this crate holds

- **Dependencies are a boundary, not a convention.** `tests/dependencies.rs`
  walks the committed `Cargo.lock` from this crate and fails if the reachable
  graph contains a workspace crate outside domain, runtime, storage, sqlite,
  sync and crypto, or any of `git2`, `libgit2-sys`, `reqwest`, Tauri or the
  Ollama and remote AI adapters. It walks the lockfile rather than the
  manifests because `skriuw-domain` takes `ai-core` from a git tag, so a
  transitive HTTP client would never show up in a manifest scan.
- **One owner thread.** Durable writes are serialized inside
  `skriuw-runtime`. The facade holds its own lock only long enough to clone the
  runtime handle, so a foreign caller waits behind another call's transaction
  for exactly as long as that transaction takes and no longer.
- **Errors are typed.** `MobileError` separates the recovery surface
  (`Recovery`), a rejected operation (`Rejected`, `UnsupportedProtocol`), a
  stale write (`Conflict`, carrying both revisions), a transient failure
  (`Busy`) and a bug (`Internal`). Details are truncated to 512 characters.
- **Panics do not cross.** Every exported call runs inside `catch_unwind` and a
  caught panic becomes `MobileError::Internal`. This only holds where the
  library is built with `panic = "unwind"`; the workspace release profile sets
  `panic = "abort"`, so `scripts/build-android.sh` passes
  `--config 'profile.release.panic="unwind"'` and every other device build must
  do the same.

## Generating bindings

`bindgen/` is the generator, and it declares its own `[workspace]` so the
repository gate never builds it. That is not a style choice: `scripts/build.sh`
runs clippy with `--all-features`, so a feature flag inside this crate would
still have pulled clap, askama and `cargo_metadata` into every `check.sh`.

```bash
cargo build -p skriuw-mobile
cargo run --manifest-path crates/skriuw-mobile/bindgen/Cargo.toml -- \
  generate --library target/debug/libskriuw_mobile.so \
  --language kotlin --language swift --out-dir .build/mobile-bindings
```

Generated bindings are build output. They are not committed here; Mobile 06
owns where they land inside the Expo module.

## Android

`scripts/build-android.sh` builds `aarch64-linux-android` and
`x86_64-linux-android` with cargo-ndk and prints each `.so` size. It needs
`cargo install cargo-ndk`, the two rustup targets, and `ANDROID_NDK_HOME`.
Mobile 10 wires the same invocation into CI.

## Go/no-go for ADR-0048

**Go**, with one gap named below.

The riskiest assumption held: the shared Rust core runs behind a
foreign-function boundary against native SQLite, with no change to
`skriuw-domain`, `skriuw-runtime`, `skriuw-storage` or `skriuw-sqlite`. The
facade is 200 lines over `WorkspaceRuntime`; nothing in the core needed a seam
it did not already have. UniFFI 0.32 generates Kotlin and Swift for the whole
surface, including the field-carrying error enum, so `Conflict` arrives on the
foreign side as a typed exception with both revisions rather than a string.

Verified on Linux:

- 17 host tests: open → operation → reopen persistence, a rejected stale save,
  a corrupt database surfacing the recovery error, malformed payloads refused
  before storage, a foreign protocol version refused, an unusable directory
  refused before any database work, calls after shutdown, eight concurrent
  callers without a deadlock, the panic guard, and the dependency boundary.
- Kotlin and Swift bindings generate from the built `cdylib`.
- `./scripts/check.sh` passes with the crate in the workspace.

Not verified, and the reason:

- **Android.** No NDK and no cargo-ndk on the machine this ran on, so
  `aarch64-linux-android` and `x86_64-linux-android` were not built and no
  Android binary size was measured. The host `x86_64-unknown-linux-gnu`
  release artifacts are 4.4 MB (`libskriuw_mobile.so`) and 56 MB
  (`libskriuw_mobile.a`, before dead-strip); treat those as an order of
  magnitude, not a prediction. `rusqlite` is bundled and builds for Android
  routinely, so this is a tooling gap rather than a design risk — but it is
  still the one contract line this spike did not close.
- **iOS.** Unverified. It needs a macOS host, which this repository reaches
  only through CI.
- **Generated bindings are not compiled.** No Kotlin or Swift compiler is
  available here; Mobile 06 compiles them inside the Expo module.

ADR-0048 stays `proposed` until Mobile 06 runs this on a device.
