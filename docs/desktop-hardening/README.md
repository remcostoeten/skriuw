# Desktop hardening implementation plans

Status: **planned**  
Scope: `apps/desktop`, `packages/web-spa`, and desktop-specific modules in `apps/web`  
Audience: implementation agents that should be able to complete one packet without rediscovering the system

## Outcome

These plans turn the July 2026 desktop audit into eight independently assignable work packets. The first four protect user data and secrets. The remaining four make regressions visible, reduce startup cost, improve failure UX, and make the plain-Markdown vault behave like a live local-first workspace.

The plans are intentionally prescriptive. An agent should follow the named files, sequence, invariants, and acceptance checks. If reality differs from a plan, stop and update the plan or record the decision before broadening scope.

For delegation, use the ready-to-paste prompts in [ASSIGNMENTS.md](./ASSIGNMENTS.md). Each prompt keeps the assigned agent inside one packet and requires an evidence-based handoff.

## Non-negotiable product invariants

Every packet must preserve these rules:

1. Markdown files in the configured vault are the source of truth for note and journal content.
2. SQLite is a derived index and may be rebuilt without losing canonical content.
3. A failed operation must leave either the old valid state or the new valid state, never a partial mixture.
4. Desktop remains usable without a network connection or account.
5. Cloud AI is opt-in; local Ollama remains the default.
6. Web and guest behavior must not change unless a plan explicitly says so.
7. Existing user vaults, settings, snapshots, and sync payloads remain backward compatible or receive an explicit migration.
8. Do not modify unrelated dirty worktree files. In particular, inspect `git status --short` before and after work.

## Work packets

| ID    | Plan                                                                 | Priority | Depends on                            | May run alongside   |
| ----- | -------------------------------------------------------------------- | -------- | ------------------------------------- | ------------------- |
| DH-01 | [Crash-safe workspace persistence](./01-crash-safe-persistence.md)   | P0       | None                                  | DH-04, DH-05, DH-07 |
| DH-02 | [Staged, non-destructive restore](./02-staged-restore.md)            | P0       | Prefer DH-01 atomic filesystem helper | DH-03, DH-06, DH-07 |
| DH-03 | [OS-backed AI secret storage](./03-os-secret-storage.md)             | P0       | DH-04                                 | DH-02, DH-06, DH-07 |
| DH-04 | [One atomic settings module](./04-atomic-settings.md)                | P0       | None                                  | DH-01, DH-05, DH-07 |
| DH-05 | [Desktop CI and release gates](./05-desktop-ci.md)                   | P0       | None                                  | All; merge early    |
| DH-06 | [Desktop startup and bundle reduction](./06-startup-performance.md)  | P1       | DH-05 budget tooling preferred        | DH-02, DH-03, DH-08 |
| DH-07 | [Resilient shell loading and errors](./07-shell-resilience.md)       | P1       | None                                  | DH-01, DH-04, DH-05 |
| DH-08 | [Live external Markdown reconciliation](./08-live-vault-watching.md) | P1       | DH-01                                 | DH-03, DH-06        |

## Recommended execution order

```text
Wave 1:  DH-05 CI gate      DH-04 settings      DH-01 persistence      DH-07 shell
                                   |                    |
Wave 2:                      DH-03 secrets       DH-02 restore
                                                        |
Wave 3:  DH-06 performance                    DH-08 file watching
```

If only one agent is available, use this sequence:

1. DH-05, so every later change receives automatic evidence.
2. DH-01, because ordinary note saves happen continuously.
3. DH-02, because restore is currently destructive before validation.
4. DH-04, then DH-03, so secret migration builds on one settings implementation.
5. DH-07, so desktop failures become recoverable and visible.
6. DH-06, with a bundle baseline already enforced by CI.
7. DH-08, reusing the safe persistence and reconciliation rules.

## Agent execution protocol

Each agent must do the following:

1. Read this index, its assigned plan in full, and `docs/desktop-local-first.md`.
2. Run `git status --short` and record pre-existing changes in its handoff.
3. Inspect every file in the plan's **Read first** section before editing.
4. Implement phases in order. Do not silently skip a phase.
5. Add tests at the seam described by the plan; do not test only private helpers.
6. Run the exact verification commands in the plan.
7. Update the plan's status to `implemented` only after every acceptance criterion passes.
8. In the final handoff, list changed files, commands and results, remaining risks, and any acceptance criterion not met.

### Stop conditions

Stop and ask for a decision when any of these occurs:

- A migration would delete or irreversibly rewrite an existing user file.
- A required behavior contradicts `docs/desktop-local-first.md`.
- The plan requires changing the cloud/server data model.
- A new dependency sends user content or secrets to a third party.
- A platform cannot satisfy an acceptance criterion and the fallback would weaken another platform.
- A pre-existing user change overlaps the exact lines that must be rewritten.

## Shared verification baseline

Run from the repository root unless a plan narrows the command:

```bash
bun install --frozen-lockfile
bun run --cwd packages/web-spa build
bun test packages/web-spa/src/router.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
git diff --check
```

The current audit baseline is:

- Rust tests: 77 passing.
- Strict Clippy: failing; DH-05 owns bringing it to green.
- Desktop SPA build: passing with multiple chunks over 500 KB.
- Normal CI: does not currently run desktop Rust or desktop SPA verification.

Later agents must not treat those known failures as permission to introduce additional failures. DH-05 should land early and update this baseline.

## Completion definition

This initiative is complete only when:

- All eight plan files say `Status: implemented`.
- Every plan's acceptance checklist is checked.
- CI runs the desktop verification gate on relevant pull requests.
- A manual packaged-app smoke test passes on Linux, macOS, and Windows for save, restore, secret entry, startup, route failure recovery, and external file edits.
- Public documentation no longer claims behavior the desktop implementation does not provide.
