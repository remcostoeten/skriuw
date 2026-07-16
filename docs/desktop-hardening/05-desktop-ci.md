# DH-05: Desktop CI and release gates

Status: **planned**  
Priority: **P0 — regression prevention**  
Primary owner: CI/release engineering  
Estimated size: 1–3 focused implementation days

## Outcome

Every pull request that can affect the desktop application runs one reproducible verification entry point covering Rust formatting, strict Clippy, 77+ Rust tests, desktop SPA typechecking/tests/build, and bundle budgets. Desktop releases cannot package or upload artifacts unless the same verification revision passes.

## Why this is required

Normal CI currently tests the web and mobile applications but does not compile or test desktop Rust or the Vite desktop SPA. The release workflow builds installers without first running desktop tests or Clippy. At audit time:

- `cargo test` passes 77 tests.
- `cargo clippy --all-targets --all-features -- -D warnings` fails on seven findings.
- The desktop SPA builds but reports multiple chunks over 500 KB.

A release build proving “the compiler produced an installer” is not evidence that persistence, restore, routing, or security invariants still work.

## Read first

- `.github/workflows/ci.yml`
- `.github/workflows/release-desktop.yml`
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `packages/web-spa/package.json`
- `packages/web-spa/tsconfig.json`
- `packages/web-spa/src/router.test.ts`
- `scripts/track-build.sh`
- DH-06 plan for the bundle-budget interface

## Locked design decisions

1. Local development and CI call the same repository script. Do not duplicate the command list across multiple workflows.
2. Strict Clippy warnings are errors. Fix the baseline findings rather than adding broad `allow` attributes.
3. The release workflow gates each platform build on a verification job for the exact commit/tag.
4. CI uses the pinned Bun version from root `package.json` and a stable Rust toolchain with `rustfmt` and `clippy`.
5. Use dependency caches, but never cache final verification results across commits.
6. A failing bundle budget blocks merges after DH-06 establishes the reviewed baseline.
7. Desktop-only changes must not require PostgreSQL.
8. The first implementation may run the Rust gate on Linux only for pull requests, but release builds still compile all target platforms. Platform-specific tests should be added where behavior differs.
9. Do not make checks `continue-on-error`.
10. CI names must remain stable enough for branch-protection rules.

## Verification entry point

Add `scripts/check-desktop.sh` with `set -euo pipefail`. It must resolve repository root through `git rev-parse`, use explicit paths, and support:

```text
scripts/check-desktop.sh quick  # format, typecheck, unit tests, Clippy
scripts/check-desktop.sh full   # quick + production SPA build + bundle budget
```

If modes add unnecessary complexity, one `full` path is acceptable. The script must print concise named phases and preserve each command's exit code.

Expected commands:

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
bunx tsc -p packages/web-spa/tsconfig.json
bun test packages/web-spa/src/router.test.ts
bun run --cwd packages/web-spa build
bun scripts/check-desktop-bundle.ts
```

Do not run `bun install` inside this script; callers own dependency installation.

## Implementation phases

### Phase 1: Bring local baseline to green

Fix the audited Clippy findings without behavior changes:

1. `backup.rs`: remove the empty line after the module documentation comment or convert it to a module comment.
2. `markdown.rs`: replace the manual min/max with `clamp(1, 6)`.
3. `import_export.rs`: use `strip_prefix` rather than slicing after `starts_with`.
4. `vault.rs`: use `sort_by_key` with `Reverse`.
5. `storage.rs::import_workspace`: replace excessive positional arguments with an import payload struct.
6. `lib.rs::import_workspace_archive`: accept a deserializable payload struct where Tauri IPC compatibility allows it. Coordinate TypeScript argument shape and add a compatibility test.
7. `lib.rs::save_note`: use the DH-01 request struct when available. If DH-01 has not landed, add the smallest request type that does not conflict with that plan.

Do not suppress `too_many_arguments` globally. A narrowly documented exception is allowed only when Tauri macro limitations make a request struct impossible and a test proves the wire format.

### Phase 2: Add package scripts

Add discoverable scripts:

Root `package.json`:

```json
"desktop:check": "bash scripts/check-desktop.sh full",
"desktop:test": "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml"
```

`packages/web-spa/package.json`:

```json
"typecheck": "tsc -p tsconfig.json",
"test": "bun test src",
"check": "bun run typecheck && bun run test && bun run build"
```

If `bun test src` discovers unsuitable browser-only files, narrow the pattern explicitly and document it. Do not retain tests that only search source text when behavior can be tested through an exported route tree or rendered shell.

### Phase 3: Add CI desktop job

Add a stable job such as `desktop-check` to `.github/workflows/ci.yml`:

1. Checkout.
2. Install Bun 1.3.14.
3. Install stable Rust with `rustfmt` and `clippy`.
4. Install Linux Tauri build dependencies. Reuse the known package list from `release-desktop.yml`; keep it in sync through a comment or shared setup action if maintainable.
5. Restore Bun and Cargo caches.
6. `bun install --frozen-lockfile`.
7. `bash scripts/check-desktop.sh full`.
8. Upload the Vite manifest/bundle report on failure and success for diagnosis.

Initially run for every pull request to establish reliability. Afterward, optional path filtering may skip the job only when none of these change:

- `apps/desktop/**`
- `packages/web-spa/**`
- `apps/web/src/**`
- `package.json`, `bun.lock`
- `.github/workflows/**`
- `scripts/check-desktop*`
- shared prompts/assets imported by Rust or SPA

Because the SPA imports broadly from `apps/web/src`, do not use a narrow desktop-feature-only filter.

### Phase 4: Gate release builds

In `release-desktop.yml`:

1. Add a `verify` job using the same setup and `check-desktop.sh full`.
2. Make `create-release` and all build jobs depend on `verify`, or make every build job depend on both `verify` and `create-release`.
3. Ensure a failed verify job creates no draft release. If workflow structure requires early draft creation, add cleanup or move creation after verification.
4. Ensure the verified SHA equals the built SHA. Do not check out a floating branch in later jobs.
5. Preserve existing CSP guard and artifact upload behavior.

### Phase 5: Desktop SPA behavior tests

Replace or supplement source-text route assertions with behavior-oriented tests:

- Router can resolve `/app`, `/app/trash`, `/app/activity`, tags, and people routes under hash history.
- Root shell renders a deterministic loading state.
- A route import failure renders the recovery view from DH-07.
- Tauri global absence does not crash module import in the test environment.

Add only the minimum DOM test setup needed. Prefer Bun's existing test capabilities and small pure exported helpers before introducing a large test runner.

### Phase 6: Smoke verification tiers

Define three tiers:

1. **PR unit gate:** all commands above.
2. **PR SPA smoke:** serve built `packages/web-spa/dist`, open key hash routes with Playwright/Chromium, fail on uncaught errors, blank root, or missing route shell.
3. **Release native smoke:** launch the platform artifact or unpacked Tauri binary, wait for the main window/process readiness marker, then exit cleanly. Add deeper WebDriver interaction only when stable platform support exists.

Native smoke must use a temporary app-data/vault environment and must never open a developer's real `~/.skriuw`.

### Phase 7: Branch protection and documentation

1. Document the required check name in `docs/docs_for_docs.skriuw.app/infra/release-pipeline.mdx`.
2. Configure branch protection externally if repository access permits; otherwise record the exact manual action.
3. Add troubleshooting for GTK package failures, stale Cargo cache, and bundle budget reports.

## Required tests of the gate itself

- A deliberate Rust test failure fails `desktop-check`.
- A Clippy warning fails it.
- A TypeScript error in a desktop-imported file fails it.
- A router test failure fails it.
- A production build failure fails it.
- A deliberately lowered bundle threshold fails it and emits the measured/allowed values.
- Release jobs are skipped when verify fails.

Use a temporary local patch or dedicated script fixture; do not commit broken examples.

## Acceptance criteria

- [ ] One local script defines the desktop verification command sequence.
- [ ] Strict Clippy passes with no broad warning suppression.
- [ ] Normal CI runs desktop Rust and SPA checks.
- [ ] Release jobs depend on verification of the same SHA.
- [ ] Desktop SPA has behavior-level route/shell tests.
- [ ] Bundle reports are uploaded or printed clearly.
- [ ] A failed gate prevents release creation/upload.
- [ ] Developer and release documentation names the gate and troubleshooting steps.
- [ ] The existing web/mobile CI jobs remain green.

## Verification commands

```bash
bash scripts/check-desktop.sh quick
bash scripts/check-desktop.sh full
bun run desktop:check
git diff --check
```

Validate workflow syntax with the repository's available GitHub workflow linter. If none exists, inspect parsed YAML and run the workflow on a draft pull request before marking implemented.

## Rollback

If the new CI job is flaky, fix or temporarily narrow the flaky smoke tier; do not remove Rust tests, Clippy, typecheck, or build. Release verification must remain blocking. Revert branch-protection changes only after restoring an equivalent required gate.

## Out of scope

- Full end-to-end persistence behavior testing; DH-01 and DH-02 own those cases.
- Performance optimization; DH-06 owns it.
- Code signing/notarization changes.
- Redesigning the release artifact matrix.

## Agent handoff template

Report:

- Final local script phases.
- Baseline Clippy fixes made.
- CI/release job names and dependency graph.
- Deliberate failure tests performed.
- Native smoke coverage per platform and any limitation.
- Branch-protection action completed or still manual.
