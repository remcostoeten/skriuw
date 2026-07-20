# Fresh Claude session prompt

Copy everything below into a new Claude session.

```text
Work on Skriuw Standalone as a parallel archive-compatibility implementation agent.

IMPORTANT: Do not modify the primary worktree at:
/home/remcostoeten/dev/skriuw-standalone

Create and use this isolated worktree from the exact verified baseline:

git -C /home/remcostoeten/dev/skriuw-standalone worktree add \
  -b feat/archive-compatibility-fixtures \
  /home/remcostoeten/dev/skriuw-claude-archive \
  6575670

cd /home/remcostoeten/dev/skriuw-claude-archive

If that branch or worktree already exists, stop and report it; do not delete, overwrite, reset, or reuse an unknown worktree.

Read these files completely before editing:
1. AGENTS.md
2. TODO.md
3. docs/handoff.md
4. ARCHITECTURE.md
5. docs/roadmap.md
6. docs/performance-contract.md
7. docs/adr/0007-portable-workspace-archive.md
8. docs/adr/0013-versioned-settings-and-note-metadata.md
9. crates/skriuw-domain/src/lib.rs, focusing on WorkspaceArchive and validation
10. crates/skriuw-domain/Cargo.toml
11. crates/skriuw-sqlite/src/lib.rs, focusing on export_archive and replace_from_archive
12. crates/skriuw-sqlite/Cargo.toml
13. generated/contracts/workspace-archive.schema.json
14. docs/fixtures.md

Run ./scripts/check.sh before editing. The expected baseline is 95 passing tests and three ignored manual tests. Verify rather than trusting the number.

Reserved architecture numbering:
- ADR-0018 belongs to the primary agent's concurrent Git integrity slice.
- Use ADR-0019 for this archive compatibility policy.
- Do not edit or create ADR-0018.

Your isolated task:
Add committed, version-indexed export/import compatibility fixtures for every currently supported WorkspaceArchive version. Only archive version 1 exists today. Do not invent version 2 or change the production wire format merely to create more fixtures.

Required fixture behavior:
- Store small human-reviewable golden JSON under a versioned repository-level path such as fixtures/archives/v1/.
- Add an explicit fixture catalogue/manifest that names every supported archive version and its golden files. Tests must fail clearly when the production supported-version set and fixture catalogue diverge.
- Include a representative version-1 workspace with root and nested nodes, notes and folders, deterministic ranks/timestamps, Unicode Markdown and structured document JSON, non-default settings, at least one unknown settings extension, an active available note, and a directly trashed subtree that remains valid.
- If more than one fixture materially improves coverage, keep each fixture small and give it one clear purpose. Do not commit generated scale workspaces or SQLite databases.
- Golden fixture bytes are immutable compatibility inputs. Tests may normalize JSON formatting for comparison, but must not rewrite fixture files during ordinary test runs.
- Unsupported future archive versions must still fail explicitly. Do not silently coerce them to version 1.

Required domain tests:
- Deserialize every catalogued golden file into WorkspaceArchive.
- Assert the filename/catalogue version matches archiveVersion.
- Run WorkspaceArchive::validate successfully.
- Assert representative compatibility-sensitive fields, including settings extension preservation and Unicode content.
- Serialize and deserialize again and prove semantic equality.
- Assert the catalogue covers every currently supported archive version exactly once or more, with no unknown version directories.
- Keep tests deterministic and independent of wall-clock time, random IDs, filesystem ordering, and network access.

Required SQLite adapter tests:
- Import every golden archive through replace_from_archive into a fresh database.
- Bootstrap and assert canonical nodes, documents, settings, active note, inherited unavailability, and search behavior.
- Export again using the fixture's exportedAt value and prove semantic archive equality after applying only explicitly documented canonical ordering normalization if required.
- Import the re-export into a second fresh database and prove the second export remains semantically identical.
- Prove an invalid/unsupported archive fails before mutation and preserves an existing workspace.
- Verify SQLite/domain integrity after each successful import.
- Put new adapter tests in a dedicated integration-test file where practical instead of expanding the large src/lib.rs test module.

Documentation and architecture:
- Write docs/adr/0019-archive-compatibility-fixtures.md. Define golden fixtures as immutable compatibility evidence, catalogue coverage, supported-version policy, normalization rules, and the rule that future archive versions require both migration code and fixtures before release.
- Write focused docs explaining fixture layout and how to add a future version.
- Do not claim backward compatibility beyond versions that production code actually accepts.
- Do not add timing claims; this is correctness-only work.

Coordination boundaries:
- The primary agent concurrently owns crates/skriuw-history, crates/skriuw-history-git, crates/skriuw-cli, ADR-0018, and Git integrity/cache rebuild.
- Do not edit any history crate, the CLI, lifecycle/runtime code, backup/recovery code, migrations, generated schemas, scale-fixture generator, or ADR-0018.
- Do not add dependencies, frameworks, build scripts, sleeps, or code comments.
- Do not modify production archive/domain/SQLite behavior unless a test exposes a genuine compatibility defect. If it does, stop and report the defect before broadening scope.
- Preserve unrelated work. Do not rebase, merge, cherry-pick, push, or modify the primary branch/worktree.

Shared-document conflict discipline:
- Keep implementation, golden fixtures, tests, ADR-0019, and the focused archive-fixture guide in the first commit.
- In a separate second commit, update TODO.md, docs/handoff.md, ARCHITECTURE.md, and docs/roadmap.md with your branch result.
- The primary agent will review/cherry-pick the implementation commit and manually reconcile the second shared-doc commit. This is intentional; do not combine shared handoff edits into the implementation commit.

Verification:
1. cargo fmt --all
2. cargo test -p skriuw-domain --locked
3. cargo test -p skriuw-sqlite --locked
4. ./scripts/check.sh
5. git diff --check

Commit discipline:
1. Commit golden fixtures, catalogue, tests, ADR-0019, and focused fixture documentation:
   test: add archive compatibility fixtures
2. Commit only shared persistent documentation updates:
   docs: hand off archive compatibility fixtures

At completion report:
- Both commit hashes.
- Files changed by each commit.
- Exact passing and ignored test counts.
- Which archive versions and fixture files are covered.
- Any normalization used for round-trip comparison.
- Any unresolved compatibility defect.
- Whether /home/remcostoeten/dev/skriuw-claude-archive is clean.

Do not merge, cherry-pick, push, or modify /home/remcostoeten/dev/skriuw-standalone.
```
