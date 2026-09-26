---
title: "ADR-0050: oxfmt and oxlint gate the v2 TypeScript"
---

- Status: accepted
- Date: 2026-09-21

## Context

The v2 gate checked Rust with `cargo fmt` and `cargo clippy -D warnings`, but
TypeScript only with `tsc`. The house conventions (function declarations for
standalone functions, arrow callbacks, no silent `catch`, `Props` for a
component's only local type) existed only as written guidance, and formatting
had drifted between an 80- and a 100-column style.

The `anti-slop` Oxlint plugin offers stricter type-evidence rules. Applied in
full to v2 it reports over 1,200 findings, most of them legitimate boundary
code: `typeof` guards and `unknown` parameters where IPC, storage, and sync
payloads are decoded, and conditional spreads that omit optional fields.

## Decision

Format and lint every v2 TypeScript and JavaScript source from the repository
root with oxfmt (`.oxfmtrc.json`, 100 columns) and oxlint (`.oxlintrc.json`).
Both run in `scripts/build.sh`, so `./bin/check` and CI fail on any
finding. `v1/` keeps its own configuration.

The rule set is:

- oxlint's `correctness` category plus explicit rules for the house
  conventions: `func-style` (declarations; a typed variable may hold an arrow
  when it implements a function-type contract), `prefer-arrow-callback`
  (named function expressions stay allowed so `memo` and `forwardRef`
  components keep their display names), `no-explicit-any`, type-only imports,
  `type` over `interface`, and `react/no-unstable-nested-components`.
- A vendored subset of `anti-slop` in `tools/oxlint/anti-slop/`: chained type
  assertions, widen-then-assert, `Reflect.get`/`Reflect.apply`, module
  mocking, `object` parameters, and aliases that resolve to `unknown`.
- A local `skriuw` plugin in `tools/oxlint/skriuw/`: `no-silent-catch`
  (a `catch` must contain a statement; comments do not count, `noop()` marks a
  deliberate swallow) and `local-type-name` (a `.tsx` module's single,
  non-exported type is named `Props`; other modules keep descriptive names
  because `Props` means component props).

Test code, harnesses, and e2e drivers may use `any` and chained assertions for
test doubles.

## Deferred

These rules are off, not rejected. Each needs a behavior-reviewed migration
before it can gate:

- React Compiler rules (`react/refs`, `set-state-in-effect`, `purity`,
  `immutability`, and related) and `exhaustive-deps`: roughly 190 findings in
  code that reads refs deliberately under the performance contract.
- `jsx-a11y`: roughly 150 findings, mostly role and focus semantics that
  change interaction behavior when fixed.
- `anti-slop` boundary rules (`no-runtime-typeof`, `no-unknown-parameters`,
  `no-unknown-returns`, `no-unsafe-dictionary-type`,
  `require-safety-comment-for-type-assertion`): these conflict with decoding
  at trust boundaries until those boundaries have schema parsers.

## Consequences

- Style review becomes mechanical; the reformat commit is listed in
  `.git-blame-ignore-revs`.
- Suppressions need an inline reason and are visible in review.
- Upgrading oxlint requires upgrading `@oxlint/plugins` to the same exact
  version.
