# Fresh Codex session prompt

Copy everything below into a new Codex session.

```text
Continue the Skriuw Standalone implementation as the primary agent.

Repository and branch:
- Work only in /home/remcostoeten/dev/skriuw-standalone.
- Stay on feat/instant-local-first-foundation.
- The verified implementation/handoff baseline is commit 6575670.
- Fresh-session prompt documentation may be committed on top of that baseline.
- No Git remote is configured. Do not claim work is pushed.
- Claude may concurrently work in an isolated archive-fixture worktree. Do not edit that worktree, merge it, rebase it, or integrate it until the user supplies its completed commits.

Before editing, run:

cd /home/remcostoeten/dev/skriuw-standalone
git status --short
git branch --show-current
git log --oneline --decorate -15

The primary worktree must be clean before implementation. Read these files completely in this order:
1. AGENTS.md
2. TODO.md
3. docs/handoff.md
4. ARCHITECTURE.md
5. docs/roadmap.md
6. docs/performance-contract.md
7. docs/adr/0005-background-git-history.md
8. docs/adr/0006-native-git-materializer.md
9. docs/adr/0014-bounded-failure-diagnostics.md
10. crates/skriuw-history/src/lib.rs
11. crates/skriuw-history-git/src/lib.rs
12. crates/skriuw-history-git/src/native.rs
13. crates/skriuw-storage/src/lib.rs
14. crates/skriuw-sqlite/src/lib.rs, focusing on HistoryCache
15. crates/skriuw-cli/src/main.rs

Verify the baseline before trusting it:
- ./scripts/check.sh
- Expected baseline: 95 tests pass.
- Three manual tests are ignored by the default suite: two backend benchmarks and one 5,000-note fixture materialization.
- Rust toolchain is 1.95.0.

Reserved architecture numbering:
- ADR-0018 belongs to this Git integrity slice.
- ADR-0019 is reserved for Claude's concurrent archive-compatibility slice.
- Do not reuse or renumber either ADR.

Your isolated task:
Implement read-only Git history repository integrity verification and an explicit transactional history-cache rebuild command.

Required integrity behavior:
- Checking an existing repository must never create, initialize, repair, fetch, reset, checkout, or otherwise mutate it.
- Keep Git and libgit2 types inside the native-only skriuw-history-git adapter.
- Treat an existing, valid non-bare repository with no refs/heads/history ref as healthy empty history.
- Reject a missing repository, a bare repository, a repository without a worktree, and an unreadable repository explicitly.
- Starting at refs/heads/history, verify that reachable history is one linear chain: a root has no parent and every later history commit has exactly one parent. Reject merges and broken ancestry.
- Validate every commit's required Skriuw-Outbox, Skriuw-Note, Skriuw-Revision, and Skriuw-Created-At metadata using the existing identifier, positive-revision, and non-negative timestamp rules.
- Reject duplicate outbox IDs and invalid or duplicate history identities where they would make retry/cache semantics ambiguous.
- For every commit, verify that notes/<note-id>.md resolves in that commit to a readable blob containing valid UTF-8 Markdown.
- Produce a typed report/result with deterministic counts and typed issues. Public diagnostics must use the existing bounded, redacted integrity/history diagnostic contract and must not expose filesystem paths, Git object IDs, libgit2 messages, or repository internals.
- Preserve lazy history Markdown reads. Integrity work must run only when explicitly requested, never during startup, bootstrap, save, navigation, or version-header rendering.

Required cache-rebuild behavior:
- Reuse the existing backend-neutral HistoryReader and HistoryCache boundaries where they remain correct.
- Validate/enumerate the complete Git history before changing SQLite history_cache.
- Replace the cache only through the existing transactional replace_history_headers operation.
- Any Git validation/read failure must leave the old SQLite cache unchanged.
- Any SQLite replacement failure must roll back the complete cache replacement.
- An empty valid history repository must rebuild to an empty cache successfully.
- Do not rewrite Git, materialize outbox work, or load Markdown into the cache.

CLI boundary:
- Add history-integrity <history-repository>.
- Add history-rebuild-cache <database> <history-repository>.
- A healthy integrity check exits successfully and prints a concise count.
- An unhealthy check or failed rebuild exits non-zero through a bounded/redacted Diagnostic.
- The rebuild command prints the number of cached headers only after commit.
- Update CLI help.

Regression tests must be deterministic and must not use sleeps. Cover at least:
1. Healthy empty existing repository.
2. Healthy multi-note linear history.
3. Missing/non-repository and bare repository rejection without creating files.
4. Merge history rejection.
5. Invalid/missing metadata rejection.
6. Duplicate outbox identity rejection.
7. Missing, non-blob, or non-UTF-8 note content rejection.
8. Successful cache rebuild including the empty case.
9. Corrupt Git history leaves an existing SQLite cache byte-for-byte/semantically unchanged.
10. SQLite cache replacement failure rolls back.
11. Public diagnostics redact paths, object IDs, and backend text.

Architecture and scope constraints:
- Write ADR-0018 describing the integrity model, read-only boundary, linear-history invariant, cache replacement order, and failure behavior.
- Keep changes centered on crates/skriuw-history, crates/skriuw-history-git, crates/skriuw-cli, tests, ADR-0018, and relevant maintenance documentation.
- Do not change workspace operations, archive versions, generated contracts, ranking, trash, settings, backup, database swap, fixture generation, or UI architecture.
- Do not add dependencies, frameworks, network Git features, sleeps-based synchronization, or code comments.
- Do not scan all Git refs; refs/heads/history is the owned history boundary.
- Do not place Git types in skriuw-domain or skriuw-storage.
- Preserve unrelated work and user changes. Use apply_patch for edits.

Verification:
1. cargo fmt --all
2. cargo test -p skriuw-history --locked
3. cargo test -p skriuw-history-git --locked
4. cargo test -p skriuw-cli --locked
5. ./scripts/check.sh
6. Run CLI smoke in a mktemp -d directory for healthy integrity, successful empty/cache rebuild, and a corrupt-history failure. Do not rely on broad or user-owned paths.
7. git diff --check

Commit discipline:
1. Commit implementation, deterministic tests, ADR-0018, CLI help, and focused maintenance docs:
   feat: verify Git history integrity
2. In a separate commit, update TODO.md, docs/handoff.md, ARCHITECTURE.md, and docs/roadmap.md with the exact result, new test count, verification result, remaining gap, and Claude integration status:
   docs: hand off archive compatibility slice

Do not begin another implementation slice and do not integrate Claude automatically. At completion report:
- Both commit hashes.
- Files changed by each commit.
- Exact passing and ignored test counts.
- CLI smoke results.
- Any unresolved issue.
- Whether the primary worktree is clean.
```
