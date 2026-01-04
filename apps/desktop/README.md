# Desktop App (Tauri)

This is the Next.js UI that powers the Tauri desktop application. The app uses Tauri to bundle a lightweight Rust backend with this Next.js frontend, creating a cross-platform desktop application.

## Monorepo Organization

This project is organized as a monorepo with shared packages to maximize code reuse across platforms:

- `apps/desktop/` - Tauri desktop app (this directory) - contains the Next.js UI and Rust backend
- `apps/web/` - Web version of the application - shares UI components and business logic with desktop
- `packages/ui/` - Shared UI components (buttons, forms, dialogs, etc.) used by both apps
- `packages/shared/` - Shared utilities, types, and common business logic
- `packages/crud/` - Shared CRUD adapters and data layer abstractions
- `packages/config/` - Shared ESLint, TypeScript, and build configurations

Both the desktop and web apps consume the same UI components and shared packages, ensuring consistency in user experience and business logic across platforms. The desktop app adds Tauri-specific features like file system access, native window controls, and desktop integration.

## Development

### Running the Desktop App

Start the full Tauri application with both the Rust backend and Next.js frontend:

```bash
# From the repository root
pnpm dev:desktop

# Or specifically from apps/desktop
pnpm tauri dev
```

This launches the Tauri development window with hot reload for both Rust and Next.js changes.

### UI-Only Development

For rapid UI development without the Tauri overhead, you can run the Next.js dev server standalone:

```bash
# From apps/desktop
pnpm dev
```

This runs the Next.js dev server at http://localhost:3000 for UI development. Note that Tauri-specific APIs (window controls, file system access, native dialogs, etc.) will not be available in this mode. Use this for styling, component work, and general UI polish.

### Environment Variables

Create a `.env.local` file in `apps/desktop/`:

```env
# Required for database and API connections
DATABASE_URL=your_database_url_here

# Add any app-specific environment variables
# These are available in both Next.js server code and client-side code
```

Environment variables are loaded by both the Next.js server and the Tauri app. Tauri-specific env vars can also be set in `src-tauri/tauri.conf.json`.

### Configuration Files

- `next.config.ts` - Next.js configuration, including port and build settings
- `src-tauri/tauri.conf.json` - Tauri app configuration (window settings, permissions, etc.)
- `src-tauri/Cargo.toml` - Rust dependencies and crate configuration
- `.env.local` - Local environment variables (not committed to git)

## Build & Packaging

### Development Build

Create a development build of the desktop app (faster build, less optimized):

```bash
# From the repository root
pnpm build:desktop

# Or from apps/desktop
pnpm tauri build --debug
```

### Production Build

Create optimized installers for distribution:

```bash
# From the repository root
pnpm build:desktop:prod

# Or from apps/desktop
pnpm tauri build
```

### Build Artifacts

After building, installers appear in `apps/desktop/src-tauri/target/release/bundle/`:

- **macOS**: `.dmg` disk image and `.app` bundle
- **Windows**: `.exe` NSIS installer and `.msi` WiX installer
- **Linux**: `.deb` package, `.AppImage` portable executable, and other formats based on platform

The exact artifact names include the app version from `src-tauri/Cargo.toml`.

## Troubleshooting

### Common Issues

**Port already in use**: The Next.js dev server uses port 3000. If this port is occupied, modify the port in `next.config.ts` or stop the conflicting process.

**Tauri dev fails**: Ensure you have Tauri dependencies installed. See [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites). Common issues include missing system libraries on Linux or Xcode Command Line Tools on macOS.

**Hot reload not working**: For UI changes, use `pnpm dev` for faster iterations. Use `pnpm tauri dev` when testing Tauri-specific functionality. Rust changes require a full rebuild with `pnpm tauri dev`.

**Environment variables not loading**: Ensure `.env.local` is in the `apps/desktop/` directory and restart the dev server. Check that variable names are correctly prefixed for client-side access if needed.

**Build fails with "file not found"**: Ensure all shared packages are built first. Run `pnpm install` from the repository root to link all packages.

**Window controls not appearing**: Check that `src-tauri/tauri.conf.json` has the correct decorations and window settings for your platform.

## Documentation

- [Tauri Documentation](https://tauri.app/) - Tauri framework docs
- [Tauri API Reference](https://tauri.app/v1/api/js/) - JavaScript API for Tauri commands
- [Next.js Documentation](https://nextjs.org/docs) - Next.js framework docs
- [Monorepo Scripts](../../README.md) - Root README with available scripts
- [Tauri Configuration Guide](https://tauri.app/v1/guides/features/process) - Tauri setup and configuration
- [scripts/README.md](../../scripts/README.md) - Development scripts and CLI tools

## Deployment

**Note**: Unlike the web app which deploys to Vercel, the desktop app is deployed via installers. Web hosting platforms like Vercel are not applicable to the Tauri desktop application.

### Distribution Steps

1. Build production installers using the commands above
2. Test installers on each target platform (macOS, Windows, Linux)
3. Sign your application (required for distribution on some platforms)
4. Upload installers to your distribution platform (GitHub Releases, website, etc.)
5. Update version numbers in `src-tauri/Cargo.toml` for new releases

For more on code signing and distribution, see the [Tauri Distribution Guide](https://tauri.app/v1/guides/building/distribution).
