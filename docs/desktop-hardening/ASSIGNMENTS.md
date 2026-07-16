# Desktop hardening assignment prompts

Use one prompt per implementation agent. Replace `<agent-name>` only if your orchestrator needs an explicit owner. Do not assign a dependent packet until the dependency named in the index is implemented or the agents have agreed on the shared interface.

## DH-01 assignment

```text
You own DH-01, crash-safe workspace persistence, in the Skriuw repository.

Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/01-crash-safe-persistence.md
- docs/desktop-local-first.md

Follow DH-01 phase by phase. Do not redesign backup restore, live file watching, Markdown format, cloud sync conflict policy, or rich-content persistence. Preserve every non-negotiable invariant in the index. Inspect git status before editing and do not touch unrelated user changes.

Implement the plan, add every required failure-path test, run its verification commands, and check acceptance boxes only when evidence exists. If a locked decision is impossible, stop and report the exact code evidence instead of inventing a broader design.

Your handoff must include changed files, atomic replacement behavior per OS, SQLite transaction contents, injected failure cases, command results, remaining risks, and unchecked acceptance criteria.
```

## DH-02 assignment

```text
You own DH-02, staged non-destructive restore, in the Skriuw repository.

Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/02-staged-restore.md
- docs/desktop-hardening/01-crash-safe-persistence.md
- docs/desktop-local-first.md

Confirm whether DH-01 has landed and reuse its atomic filesystem helper if present. Do not create a competing generic helper. Follow inspect -> stage -> validate -> commit -> verify -> cleanup exactly. Never test against a personal vault and never retain clear-before-extract as a fallback.

Implement all phases and injected rollback tests. Run the plan's verification commands. Your handoff must describe staging and rollback paths, archive limits, multi-root rollback order, platform behavior, UI recovery copy, command results, risks, and unchecked acceptance criteria.
```

## DH-03 assignment

```text
You own DH-03, OS-backed AI secret storage, in the Skriuw repository.

Do not begin implementation until DH-04's SettingsStore interface is available. Read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/03-os-secret-storage.md
- docs/desktop-hardening/04-atomic-settings.md
- docs/desktop-local-first.md

Keep all secret values out of TypeScript, JSON, snapshots, logs, Debug output, and errors. Do not add a plaintext fallback. Preserve a legacy plaintext value until secure write and read-back succeed, but do not use it for cloud AI after a migration failure.

Implement the adapter, migration, reset/snapshot semantics, UI states, tests, and documentation. Run every verification command and complete the platform matrix. Your handoff must include the chosen credential library/features, stable service/account names, migration failure behavior, sentinel-secret snapshot proof, platform results, risks, and unchecked criteria.
```

## DH-04 assignment

```text
You own DH-04, the atomic desktop settings module, in the Skriuw repository.

Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/04-atomic-settings.md
- docs/desktop-local-first.md

Create exactly one normal settings.json I/O owner. Preserve unknown fields, treat malformed JSON as recoverable corruption rather than {}, and keep secrets out of the long-term typed schema. Coordinate with DH-01 if its atomic helper already exists; do not duplicate it.

Implement the typed schema, versioning, atomic update lock, migrations, caller conversion, restore reload, tests, and docs. Run all verification commands. Your handoff must list the schema/version, unknown-field strategy, corruption behavior, removed duplicate I/O, concurrency/failure evidence, command results, risks, and unchecked criteria.
```

## DH-05 assignment

```text
You own DH-05, desktop CI and release gates, in the Skriuw repository.

Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/05-desktop-ci.md
- docs/desktop-hardening/06-startup-performance.md

Land this early so other packets inherit the gate. Use one local verification script from CI and release workflows. Fix the known Clippy baseline rather than suppressing warnings. Do not weaken an existing web/mobile gate or make any new desktop check continue-on-error.

Implement all phases feasible in-repository, deliberately prove each failure mode blocks the gate, and document any external branch-protection action. Your handoff must include final commands, Clippy fixes, workflow dependency graph, deliberate failure evidence, smoke coverage by platform, branch-protection status, risks, and unchecked criteria.
```

## DH-06 assignment

```text
You own DH-06, desktop startup and bundle reduction, in the Skriuw repository.

Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/06-startup-performance.md
- docs/desktop-hardening/07-shell-resilience.md
- docs/desktop-local-first.md

Measure the manifest's transitive static graph before optimizing. Do not use individual chunk size alone, remove features, add CDN dependencies, or accept blank lazy fallbacks. Coordinate fallbacks with DH-07 and budgets with DH-05.

Implement measurement first, then measured lazy splits and prefetch changes. Prove at least the target reduction without regressing first-editable-note median. Your handoff must include exact before/after bytes, dependency contributors, runtime methodology and median/p95, every lazy feature/fallback, final budgets, remaining startup-critical heavy imports, risks, and unchecked criteria.
```

## DH-07 assignment

```text
You own DH-07, resilient desktop shell loading and errors, in the Skriuw repository.

Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/07-shell-resilience.md
- docs/desktop-hardening/06-startup-performance.md
- docs/desktop-local-first.md

Keep the boot/recovery dependency graph small. Remove the duplicate WindowControls mount, replace every null route fallback, keep the splash until visible React state commits, and make save failures persistent without losing the draft. Do not add remote telemetry or redesign unrelated UI.

Implement all phases, behavior tests, accessibility checks, and packaged platform checks. Your handoff must include shell state ownership, single native-chrome mount, fallbacks/errors, splash handshake, save/quit failure behavior, command results, platform/accessibility results, risks, and unchecked criteria.
```

## DH-08 assignment

```text
You own DH-08, live external Markdown reconciliation, in the Skriuw repository.

Do not begin until DH-01 is implemented. Before editing, read in full:
- docs/desktop-hardening/README.md
- docs/desktop-hardening/08-live-vault-watching.md
- docs/desktop-hardening/01-crash-safe-persistence.md
- docs/desktop-hardening/02-staged-restore.md
- docs/desktop-local-first.md

Do not ship a watcher without revision-checked saves. Never silently choose last writer. External content stays canonical and every conflict path preserves both external content and the local draft. Reuse DH-01 persistence and coordinate watcher pause/rebind with DH-02 restore.

Implement revision reads/saves, targeted reconciliation, watcher lifecycle, internal-event suppression, frontend cache updates, conflict UX, large-vault safeguards, tests, and docs. Your handoff must include watcher library/platform behavior, revision design, conflict preservation proof, event latency and 10,000-file results, lifecycle integration, platform limitations, command results, risks, and unchecked criteria.
```
