<p align="center">
  <img src="app/src-tauri/icons/128x128.png" width="88" alt="Skriuw logo" />
</p>

<h1 align="center">Skriuw</h1>

<p align="center">
  <em><strong>skriuw</strong> · verb · Frisian<br />
  "to write"</em>
</p>

<p align="center">
  A fast, private writing workspace for notes, journals, and connected knowledge.<br />
  <strong>No server, no Node: the entire app is Rust compiled to WebAssembly, database included, running in your browser.</strong>
</p>

<p align="center">
  <a href="https://github.com/remcostoeten/skriuw/releases/latest"><img src="https://img.shields.io/github/v/release/remcostoeten/skriuw?label=release" alt="Latest release" /></a>
  <a href="https://github.com/remcostoeten/skriuw/actions/workflows/ci-v2.yml"><img src="https://github.com/remcostoeten/skriuw/actions/workflows/ci-v2.yml/badge.svg" alt="CI status" /></a>
  <a href="../LICENSE"><img src="https://img.shields.io/github/license/remcostoeten/skriuw" alt="MIT license" /></a>
  <a href="https://github.com/remcostoeten/skriuw/releases"><img src="https://img.shields.io/github/downloads/remcostoeten/skriuw/total?label=downloads" alt="Total downloads" /></a>
</p>

![The Skriuw workspace](docs/assets/preview.png)

Your workspace is a SQLite database on your machine. Open the app, type, and
every keystroke paints in the same frame: no spinners, no server round-trips,
no account. Try it without installing anything: the **full app runs in your
browser** at [skriuw.com/app](https://skriuw.com/app).

- A real rich-text editor that speaks Markdown
- `#` tags, `$` people, and `[[` wiki-links; renames propagate, backlinks everywhere
- Automatic Git history and verified backups, in the background
- Imports from Obsidian, Notion, Bear, Apple Notes, and plain Markdown
- Keyboard-first, fast at thousands of notes, sync strictly opt-in

Everything else (journal, tabs, split view, flowcharts, properties, trash)
is in [FEATURES.md](docs/FEATURES.md).

## What makes it different

Most "local-first" apps are a web client with a cache. Skriuw is one Rust
core (schema, operations, search, history) with an adapter per platform:
the desktop app links against native SQLite, and the browser runs **the same
core compiled to WebAssembly** with a real SQLite database in OPFS.
[skriuw.com/app](https://skriuw.com/app) is the entire application, not a demo.

Writes paint in the same frame and become durable on a background queue the
UI never waits for; history, backups, and sync can fail and retry without
ever touching typing or navigation. The full system shape is in
[ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Installation

The [latest GitHub release](https://github.com/remcostoeten/skriuw/releases/latest)
has installers for macOS, Windows, and Linux (`.dmg`, `.exe`/`.msi`, `.deb`,
`.rpm`, AppImage).

### Debian / Ubuntu (APT)

```bash
curl -fsSL https://remcostoeten.github.io/skriuw/apt/key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg
echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] https://remcostoeten.github.io/skriuw/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

### Fedora / RHEL / openSUSE (dnf)

```bash
sudo dnf config-manager addrepo --from-repofile=https://remcostoeten.github.io/skriuw/rpm/skriuw.repo
sudo dnf install skriuw
```

### macOS (Homebrew)

```bash
brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw
brew install --cask skriuw
```

### Windows (Scoop)

```powershell
scoop bucket add skriuw https://github.com/remcostoeten/skriuw
scoop install skriuw
```

### Arch Linux (AUR)

```bash
yay -S skriuw-bin
```

AUR publication is currently paused upstream, so that package can lag behind
the latest release. Winget and Snap are wired into release automation but
have no current publication; use a release asset or one of the channels above.

## Privacy

A fresh install performs no network requests, and there is no analytics or
telemetry of any kind. The only network code is the opt-in sync Worker and
the updater's version check. Sync is encrypted in transit but not yet
end-to-end ([details](docs/specs/cloud-sync-master.md)); if that boundary
matters, stay local-only.

## Development

Rust 1.95, Bun 1.3, Node.js 24, and the platform dependencies required by
Tauri.

```bash
./scripts/bootstrap.sh   # one-time setup
./scripts/check.sh       # full gate: contracts, lint, all tests
./scripts/build.sh       # build (also: web | desktop | ci)
```

The repository layout, web deployment, and cloud development reference is in
[docs/development.md](docs/development.md). Contributions start at
[CONTRIBUTING.md](../CONTRIBUTING.md); report security issues through
[SECURITY.md](../SECURITY.md) instead of a public issue.

The previous generation of Skriuw (web, mobile, collaboration, self-hosting)
lives in [`apps/`](../apps) and [`packages/`](../packages) and is frozen; see
the [repository README](../README.md).

## License

[MIT](../LICENSE)
