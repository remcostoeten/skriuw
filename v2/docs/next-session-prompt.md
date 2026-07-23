# Next Codex session instruction

The standalone Linux v1 implementation and C3 release gate are complete in
`/home/remcostoeten/dev/skriuw-standalone`.

Read `AGENTS.md`, `TODO.md`, `docs/handoff.md`, `ARCHITECTURE.md`,
`docs/product-scope-v1.md`, and the relevant ADRs before changing code. Verify
the branch, worktree, recent commits, and test state rather than trusting
recorded counts. Preserve the unrelated `.claude/` directory.

The close-boundary `rememberLastNote` implementation is `9554d43`; its handoff
is `6a668d2`. The C3 production workflow gate is `9a1b4da`. Exact workflow,
performance, build, machine, platform, and limitation evidence is in
`docs/benchmarks/2026-07-23-product-c3.md` and its two raw JSON files.

There is no immediate strict-v1 implementation task. Do not begin a post-v1
feature, expand the Linux-only platform claim, add React Scan, or change scope
without an explicit product decision. For maintenance work, preserve the
performance and local-first contracts, run focused regressions plus
`./scripts/generate.sh`, `./scripts/check.sh`, and `git diff --check`, update
continuity documents, and commit verified slices separately. Do not push or
open a pull request unless the user asks.
