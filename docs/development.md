# Development reference

Contributor-facing detail that goes beyond the quick start in the
[README](../README.md).

## Requirements

Rust 1.95.0 (`rust-toolchain.toml` installs components via rustup), Bun 1.3,
Node.js 24, Bash, and the platform dependencies required by Tauri.

## Scripts

```bash
./scripts/bootstrap.sh   # one-time setup
./scripts/check.sh       # full check gate: contracts, lint, all tests
./scripts/build.sh       # build (also: web | desktop | ci)
./scripts/generate.sh    # regenerate Rust→TypeScript JSON Schema contracts
./scripts/check-wasm.sh  # browser portability + OPFS durability gate
./scripts/dev-db.sh      # local dev database
```

Generated contracts in `contracts/generated` are committed and drift-checked
in CI. `skriuw-cli` (`cargo run -p skriuw-cli -- <snapshot|integrity|export|backup|restore>`)
provides database utilities.

### Native AI end-to-end suite

`node app/e2e/run-native-ai.mjs` drives a real Tauri debug build through
`tauri-driver` and WebKitWebDriver: AI opt-in gating, the Ollama runtime and
model panels, the prompt playground (including a live mid-stream cancel), and
the remote-provider credential flows. It needs a complete Ollama release
(binary plus `lib/ollama` runners) reachable on `PATH`, and it shares the real
app data directory — park `~/.local/share/dev.skriuw.app/ai-consent.json`
before a run on a machine that has already granted provider consent, or the
consent-gating assertions see pre-existing state. Real mid-stream abort is
also covered at the provider seam by
`cargo test -p skriuw-ai-ollama cancels_a_real_completion_mid_stream -- --ignored`.

## Layout

```text
crates/skriuw-domain       Data and operation protocol; no I/O
crates/skriuw-storage      Storage port
crates/skriuw-sqlite       Native SQLite adapter and ordered SQL migrations
crates/skriuw-sqlite-wasm  Browser SQLite-WASM/OPFS adapter and worker
crates/skriuw-runtime      Serialized backend worker and request queue
crates/skriuw-sync         Optional background cloud sync coordinator
crates/skriuw-history      Portable leased history worker
crates/skriuw-history-git  Native Git history adapter
crates/skriuw-images       Note image decoding and storage
crates/skriuw-lifecycle    Startup, shutdown, and backup rotation
crates/skriuw-fixtures     Deterministic scale fixtures
crates/skriuw-cli          Database development utility
cloud                      Cloudflare Worker sync service
app                        React renderer and Tauri desktop shell
app/harnesses              Retained measurement harnesses run by the build
crates/xtask               Repository automation and contract generation
contracts/generated        Generated JSON Schema
docs                       ADRs, specs, and benchmarks
scripts                    Contributor/CI entrypoints
```

Inside `app/src`, product features live under `features/` (editor, journal,
references, settings, transfer, and so on); `bridge/`, `store/`, `shell/`,
`commands/`, `shared/`, and `contracts/` are the platform layers beside them.
The desktop shell in `app/src-tauri` keeps `lib.rs` as command registration,
with shared state in `state.rs` and one command module per capability under
`commands/`.

## Web deployment

The repository-root Vercel project serves an indexable static product page at
`https://skriuw.com/` and the browser build at `https://skriuw.com/app/`.
Its build runs `scripts/vercel-build.sh`, which compiles the pinned Rust core
to WASM, builds the renderer with the `/app/` asset base, and stages the site,
crawl metadata, and application as one static deployment artifact. The
`skriuw.vercel.app` and `www.skriuw.com` hosts permanently redirect to the apex
domain, and the application shell stays out of search results so crawlers land
on the public product page. The Cloudflare Worker remains the separate
authentication and sync data plane. After deployment, run
`node scripts/verify-web-deployment.mjs` to check the static assets, WASM
MIME type, browser bootstrap, OPFS initialization, and browser console.

## Cloud development

The sync service is a Cloudflare Worker in `cloud/`; see
[cloud/README.md](../cloud/README.md) for deployment. Apply its D1 migrations
and create `.dev.vars` from `.dev.vars.example`, then start it locally —
debug desktop builds use `http://localhost:8787`, release builds use the
production Worker. Set `VITE_SKRIUW_CLOUD_URL` to override at build time.

The Worker only answers origins in `AUTH_TRUSTED_ORIGINS` (403 otherwise).
Production trusts `https://skriuw.com` and the Tauri origins — never widen
that list to make a test pass. For end-to-end runs against real
infrastructure use the `preview` environment, which has its own D1/R2/Durable
Object storage and is the only deployment trusting the
`http://localhost:5183` dev origin:

```bash
bun --cwd cloud run check
bunx wrangler deploy --env preview   # in cloud/
```
