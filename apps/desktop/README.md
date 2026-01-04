# Skriuw Desktop App

This is the desktop frontend for Skriuw, built with [Next.js](https://nextjs.org) and [Tauri](https://tauri.app).

## Architecture

This application serves as the UI layer for the Tauri desktop application. It mimics the web version but is optimized for desktop usage (local storage, OS integrations).

- **`apps/desktop`**: This Next.js application (UI).
- **`src-tauri`**: The Rust backend for Tauri (located in the root or parallel directory depending on configuration, check `tauri.conf.json`).

## Development

To run the desktop app in development mode:

1.  Make sure you are in the root of the monorepo.
2.  Run the Tauri dev command:

```bash
npm run tauri dev
# or
yarn tauri dev
```

This will start both the Next.js dev server and the Tauri window.

## Building

To build the application for distribution:

```bash
npm run tauri build
```

This will produce installers for your current operating system.

## Key Differences from Web

- **Storage**: Uses local filesystem capabilities via Tauri APIs instead of pure browser storage or cloud-only adaptations where applicable.
- **Routing**: Optimized for offline-first usage.

