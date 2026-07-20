# Fresh Claude session prompt

Copy everything below into a new Claude session.

```text
Continue Skriuw Standalone as the parallel backend-workload agent.

Repository isolation:
- Never modify /home/remcostoeten/dev/skriuw-standalone.
- Verified baseline is a3f15c5 on feat/instant-local-first-foundation.
- Create this new isolated worktree only if neither path nor branch exists:

git -C /home/remcostoeten/dev/skriuw-standalone worktree add \
  -b feat/backend-workload-measurements \
  /home/remcostoeten/dev/skriuw-claude-workloads \
  a3f15c5

cd /home/remcostoeten/dev/skriuw-claude-workloads

- If the branch or path already exists, stop and report it. Never delete, reset, overwrite, rebase, merge, or reuse an unknown worktree.
- No Git remote exists. Do not claim work is pushed.

Use cheaper subagents for speed:
- You remain the only agent allowed to edit files, update Git, or make architecture decisions.
- Start up to three bounded read-only subagents in parallel, using Haiku or the cheapest available capable model:
  1. Inventory agent: inspect existing fixture, benchmark, SQLite import/bootstrap, and Git history APIs; return exact reusable symbols/files and likely pitfalls.
  2. Measurement-design agent: propose deterministic correctness coverage, release measurement cases, sample format, and environment metadata. It must not edit.
  3. Review agent: after implementation, inspect the diff against this prompt and AGENTS.md, identify missing invariants or scope drift, and run focused read-only verification if supported.
- Give every subagent AGENTS.md constraints and a strict file/task boundary.
- Run inventory and design agents concurrently while you inspect mandatory files yourself.
- Do not delegate reading or interpreting repository instructions. Read every mandatory file yourself.
- Do not let subagents edit overlapping files. Main agent integrates all findings.
- If cheap-model subagents are unavailable, continue alone without blocking.
- Summarize useful subagent findings in your final report; do not paste verbose transcripts.

Before editing, verify:

git status --short
git branch --show-current
git log --oneline --decorate -12
./scripts/check.sh

Expected baseline: clean worktree, Rust 1.95.0, 110 passing tests, and three ignored manual tests. Verify rather than trust these numbers.

Read completely, in order:
1. AGENTS.md
2. TODO.md
3. docs/handoff.md
4. ARCHITECTURE.md
5. docs/roadmap.md
6. docs/performance-contract.md
7. docs/fixtures.md
8. docs/adr/0005-background-git-history.md
9. docs/adr/0006-native-git-materializer.md
10. docs/adr/0016-deterministic-scale-fixtures.md
11. docs/adr/0018-read-only-git-history-integrity.md
12. crates/skriuw-fixtures/Cargo.toml
13. crates/skriuw-fixtures/src/lib.rs
14. crates/skriuw-fixtures/tests/sqlite_materialization.rs
15. crates/skriuw-storage/src/lib.rs, focusing on archive, history queue/cache, and bootstrap ports
16. crates/skriuw-sqlite/src/lib.rs, focusing on apply_operations, export_archive, replace_from_archive, bootstrap, and history queue/cache
17. crates/skriuw-history/src/lib.rs
18. crates/skriuw-history-git/src/lib.rs
19. crates/skriuw-history-git/src/native.rs
20. existing files under docs/benchmarks/

Parallel ownership:
- Your task owns backend workload measurement code under crates/skriuw-fixtures, one focused benchmark document, and its focused tests.
- Primary Codex work concurrently owns UI/editor/tree/store/desktop-bridge spikes, frontend or package-manager files, ADR-0020, and UI architecture documentation.
- Do not edit UI files, package.json files, frontend configuration, docs/adr/0020*, or any future desktop shell.
- Do not edit production domain, SQLite, history, Git, runtime, lifecycle, CLI, migrations, generated contracts, archive golden fixtures, or existing ADRs unless a genuine blocker is proven. Report blockers before broadening scope.
- No shared source file may be edited by both agents.

Your isolated task:
Add deterministic correctness harnesses and manual optimized-build measurements for import, bootstrap, and native Git history workloads over existing generated scale fixtures.

Required workload behavior:
- Reuse generate_workspace_fixture and semantic operation batches. Do not add a second fixture generator.
- Cover representative 1,000-note and 5,000-note generated workspaces. Prefer Mixed shape unless evidence requires another shape.
- Keep fixture generation outside measured intervals.
- Materialize source SQLite state before measuring export/import. Validate fixture counts and integrity before timing.
- Import workload: measure replace_from_archive into a fresh file-backed SQLite database. Include database open separately or explicitly state whether it is excluded.
- Bootstrap workload: measure bootstrap from a fully materialized file-backed database. Make cold/warm limitations explicit; do not claim OS cache control that is not implemented.
- History workload: distinguish outbox-to-Git materialization from validated history-cache rebuild. Do not combine them into one unexplained number.
- Validate resulting commit/header/note counts and SQLite integrity outside measured intervals.
- Preserve lazy Markdown reads. Do not benchmark by loading every historical Markdown body unless reported as a separate optional workload.
- Use temporary directories only. Never target broad or user-owned paths.
- No sleeps, randomness, network, Git executable, timing assertions, or shared-CI performance budgets.
- Default tests must remain fast and correctness-only. Expensive measurements must be #[ignore] manual tests or a similarly explicit manual harness.
- Prefer one focused integration-test module. Add only existing workspace dependencies as dev-dependencies; add no third-party dependency.

Measurement protocol:
- Run optimized builds with --release and --locked.
- Record raw samples, median, workload size, batch size, exact command, fixture digest/name, and what is inside/outside each timed interval.
- Record environment metadata available locally: date, OS/kernel, architecture, CPU model, logical CPU count, memory, Rust version, Cargo version, and Git commit.
- Use at least five samples for practical workloads.
- If a 5,000-note history materialization sample is unusually slow, first measure one sample, report its duration, then choose a documented smaller repeat count rather than silently omitting it. Correctness must still cover 5,000 notes.
- Treat numbers as development-machine observations, not product budgets or universal claims.
- Do not add timing assertions to tests.

Required correctness coverage:
- Import and bootstrap return expected node/document/settings/active-note state for generated fixtures.
- History processing drains the expected outbox work and produces the expected linear Git commit/header counts.
- Validated cache rebuild publishes the expected headers.
- Any setup or verification failure fails loudly; never print a measurement after invalid output.
- Existing 5,000-note fixture materialization coverage stays valid.

Documentation:
- Add docs/benchmarks/2026-07-21-backend-workloads.md with method, commands, raw samples, medians, environment, limitations, and interpretation.
- Update docs/fixtures.md with the new manual workload command and what it measures.
- Do not create an ADR: this slice measures existing architecture. ADR-0020 is reserved for the primary UI architecture gate.
- Do not claim UI performance, fixed-runner budgets, cold-cache behavior, or web equivalence.

Verification:
1. cargo fmt --all
2. cargo test -p skriuw-fixtures --locked
3. Run each new ignored/manual workload in --release --locked mode with --nocapture
4. ./scripts/generate.sh
5. ./scripts/check.sh
6. git diff --check
7. Ask the cheap review subagent to audit the final diff; resolve valid findings yourself

Commit discipline:
1. Commit harness, correctness tests, Cargo changes, benchmark report, and focused fixture documentation:
   perf: measure backend fixture workloads
2. In a separate commit, update TODO.md, docs/handoff.md, ARCHITECTURE.md, and docs/roadmap.md with exact counts, commands, measurements, limitations, and next task:
   docs: hand off UI architecture gate

Shared-document discipline:
- The second commit may edit shared docs because it is isolated for handoff, but primary Codex will reconcile it manually rather than cherry-pick blindly.
- Do not modify codex-promt.md or claude-promt.md.

At completion report:
- Both commit hashes and files per commit.
- Exact passing/ignored test counts.
- Every raw sample and median.
- Exact measured boundaries.
- Environment metadata.
- Subagent tasks and useful findings.
- Any correctness or performance concern.
- Whether /home/remcostoeten/dev/skriuw-claude-workloads is clean.

Do not merge, cherry-pick, push, or modify /home/remcostoeten/dev/skriuw-standalone.
```
