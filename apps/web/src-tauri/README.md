# Skriuw desktop builds (Tauri 2)

This folder contains the Tauri 2.0 configuration for packaging the Skriuw web app as a desktop client.

## Prerequisites

- Rust toolchain (stable) and a C compiler
- Bun (per repository root)
- `@tauri-apps/cli` installed via `bun install`
- Platform SDKs for bundling:
    - **macOS**: Xcode command-line tools and signing identity if you intend to sign
    - **Ubuntu**: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, and other GTK deps typically required by Tauri

## Development

From `apps/web` run:

```bash
bun run tauri:dev
```

This starts the Next.js dev server (`http://localhost:3000`) and opens it in a Tauri window.

## Production bundling

The Tauri configuration builds the static Next.js export into `apps/web/out` and then packages it.

- **Universal macOS build** (creates `.app` and `.dmg`):
    ```bash
    bun run tauri:build:mac
    ```
- **Ubuntu `.deb` package**:
    ```bash
    bun run tauri:build:deb
    ```
- **Platform-default bundle** (uses the current host OS settings):
    ```bash
    bun run tauri:build
    ```

Artifacts are written to `apps/web/src-tauri/target/release/bundle/`.
