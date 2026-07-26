# End-to-end tests

## Browser workflow E2E (`run.mjs`)

Headless Chrome over CDP against the Vite-built harness in this directory,
with the Rust side replaced by the deterministic `bridge-mock.ts`. Covers the
full keyboard workflow; `--provider-import-only` runs just the import slice.

```bash
node app/e2e/run.mjs [--provider-import-only]
```

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
