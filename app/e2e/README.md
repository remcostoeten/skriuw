# End-to-end tests

## Browser workflow E2E (`run.mjs`)

Headless Chrome over CDP against the Vite-built harness in this directory,
with the Rust side replaced by the deterministic `bridge-mock.ts`. Covers the
full keyboard workflow; `--provider-import-only` runs just the import slice.
`--tasks-only` checks task creation, completion, source navigation, accessible
names, and focus retention from the keyboard.

`--mermaid-only` inserts, edits, toggles, expands, and theme-switches a
rendered Mermaid fence.

```bash
node app/e2e/run.mjs [--provider-import-only | --tasks-only | --personal-only | --journal-only | --mermaid-only]
```

The runner previews on port 4192 and refuses to start when something already
answers there, so a run never asserts against another worktree's build. Set
`SKRIUW_E2E_PORT` (and `SKRIUW_E2E_MOBILE_PORT` for `mobile-shell.mjs`, default
4195) to run two checkouts side by side.

The harness is hermetic: `main.tsx` installs a fake `__TAURI_INTERNALS__` so the
renderer takes the desktop bridge path instead of spawning the browser storage
worker, and `vite.config.ts` pins `VITE_SKRIUW_CLOUD_URL` to an untrusted host
so cloud sign-in resolves to the unavailable adapter and never reaches the
network. `app/performance` uses the same two seams.

## Native import E2E (`run-native.mjs`)

Drives the real debug Tauri binary through `tauri-driver` and WebKitWebDriver.
Nothing is mocked: the run exercises real file intake and ZIP extraction in
Rust, the real preview plan, a real SQLite commit, and the UI showing the
result. The scenario imports `fixtures/import-samples/notion-export.zip` into
a temporary workspace, asserts the preview counts, confirms, asserts the
sidebar and the completion report, re-imports the same archive in skip mode
and asserts nothing changes, then closes the app and queries the workspace
SQLite file directly to prove the commit is durable.

```bash
node app/e2e/run-native.mjs [--skip-build] [--output <path>]
# or, from app/: bun run e2e:native
```

Without `--skip-build` the script first runs `tauri build --debug --no-bundle`
(which also builds the frontend). Evidence lands in
`app/e2e/results/native-latest.json`.

### Prerequisites

- `tauri-driver` (`cargo install tauri-driver`)
- `WebKitWebDriver` at `/usr/bin/WebKitWebDriver` (override the path with the
  `WEBKIT_WEBDRIVER` env var). On Arch this ships in `webkitgtk-6.0`; on
  Debian/Ubuntu in `webkit2gtk-driver`. It must come from the same WebKitGTK
  release as the `webkit2gtk-4.1` the app links against.
- `sqlite3` CLI for the post-run database assertion.
- A display (X11 or Wayland). The app window opens headed; use `xvfb-run`
  when no display is available.
- Free port 4444 (`tauri-driver`) and 4445 (native driver).

### Test seams

- `SKRIUW_DB` (existing, all builds) points workspace storage at a temp
  directory, so runs never touch a real workspace.
- `SKRIUW_E2E_PICK_PATHS` (newline-separated paths) makes
  `pick_directory` / `pick_import_file` / `pick_import_files` return those
  paths instead of opening a GTK dialog. The override is compiled only into
  debug builds (`cfg(debug_assertions)`); release binaries ignore it.

### CI status

Not wired into CI. The script passed 3 consecutive local runs (Arch,
2026-07-26), but it needs a full debug desktop build, a WebKitWebDriver
matched to the runner's WebKitGTK, and a display server; that CI setup has
not been built or verified, so this stays a manually-invoked release check.

## Journal navigation

```bash
node app/e2e/run.mjs --journal-only --output /tmp/skriuw-journal-e2e.json
```

Steps the journal with the month and week bracket chords (including the
January 31 → February 28 clamp), confirms typed entry text survives stepping
away and back, then drives Go to date…: suggestions while empty, an inline error
that keeps the dialog open, `dec 2025` + Enter landing on 2025-12-01, and Escape
closing without navigating. Requires zero browser errors.

## Personal templates and saved searches

```bash
node app/e2e/run.mjs --personal-only --output /tmp/skriuw-personal-e2e.json
```

Exercises command-palette template registration and creation, then keyboard-only
saving, reopening, and removing a sidebar search. Requires zero browser errors.

## Compact shell and touch gestures (`mobile-shell.mjs`)

Drives the hermetic harness at a 390px touch-emulated viewport over CDP and
checks the compact shell: tab bar in place of the rail, no horizontal
overflow, both side panels opening as sheets and closing from their header,
the scrim edge pull, and a note pick; then the tree's touch gestures, a held
row opening the item menu with 44px rows, Escape closing only that menu, and a
leftward pull trashing a row with a working undo; then a synthetic
`beforeinstallprompt` raising the install strip above the tab bar, its
dismissal, and the dismissal surviving a reload. Requires zero console errors.

```bash
node app/e2e/mobile-shell.mjs [--output <path>]
# or, from app/: bun run e2e:mobile
```

`CHROME_BINARY` picks the browser and `CHROME_EXTRA_ARGS` appends launch
flags, for example `--no-sandbox` in a container that runs as root.

## Per-account local workspaces (`browser-account-switch.mjs`)

Drives ADR-0046 against the real browser runtime and its OPFS storage: a note
written before any sign-in is claimed in place by the first account, a second
account reopens the tab on an empty workspace of its own, switching back and
forth restores each account's notes, and the Account settings row names the
owning workspace. Adoption is invoked through the runtime bridge directly, so
no cloud is involved; the reload it triggers is what the run waits on.

```bash
node app/e2e/browser-account-switch.mjs
# or, from app/: bun run e2e:browser-account-switch
```

Previews on port 4196 (`SKRIUW_E2E_ACCOUNT_PORT` overrides it) and runs as
part of `scripts/check-wasm.sh`.
