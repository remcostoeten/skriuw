<p align="center">
  <img src="v2/app/src-tauri/icons/128x128.png" width="88" alt="Skriuw logo" />
</p>

<h1 align="center">Skriuw</h1>

<p align="center">
  A fast, private writing workspace for notes, journals, and connected knowledge.
</p>

<p align="center">
  <a href="https://github.com/remcostoeten/skriuw/releases/latest"><img src="https://img.shields.io/github/v/release/remcostoeten/skriuw?label=release" alt="Latest release" /></a>
  <a href="https://github.com/remcostoeten/skriuw/actions/workflows/ci-v2.yml"><img src="https://github.com/remcostoeten/skriuw/actions/workflows/ci-v2.yml/badge.svg" alt="v2 CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/remcostoeten/skriuw" alt="MIT license" /></a>
  <a href="https://github.com/remcostoeten/skriuw/releases"><img src="https://img.shields.io/github/downloads/remcostoeten/skriuw/total?label=downloads" alt="Total downloads" /></a>
</p>

<p align="center">
  <strong>Fully free and open source. Your workspace stays on your machine.</strong>
</p>

Skriuw _(Frisian, “to write”)_ is a keyboard-first knowledge workspace for macOS, Windows, and Linux. The current desktop app stores its canonical data in local SQLite, responds to edits immediately, maintains Git-backed history in the background, and exports portable workspace archives. Cloud sync is optional and off by default. Skriuw also runs in the browser at [skriuw.com/app](https://skriuw.com/app).

## Why Skriuw

- **Local first:** no account, server, or network connection is required.
- **Optional sync:** off by default; enable it per device if you want your workspace on more than one machine.
- **Fast by design:** navigation and editing update locally without waiting for disk or IPC.
- **Built for writing:** rich text, raw Markdown, wiki links, backlinks, search, folders, tabs, and split views.
- **Recoverable:** verified backups, portable imports and exports, trash recovery, and background version history.
- **Keyboard driven:** command palette, customizable shortcuts, full-document search, and focused navigation.
- **Open source:** the application and its architecture are available under the MIT license.

## Install

Download the latest installer for macOS, Windows, or Linux from [GitHub Releases](https://github.com/remcostoeten/skriuw/releases/latest).

| Platform                 | Package manager                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| macOS                    | `brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw && brew install --cask skriuw` |
| Windows                  | `scoop bucket add skriuw https://github.com/remcostoeten/skriuw && scoop install skriuw`            |
| Arch Linux               | `yay -S skriuw-bin`                                                                                 |
| Debian / Ubuntu          | [Configure the apt repository](v2/README.md#debian--ubuntu-apt)                                     |
| Fedora / RHEL / openSUSE | [Configure the dnf repository](v2/README.md#fedora--rhel--opensuse-dnf)                             |

Direct `.dmg`, `.exe`, `.msi`, `.deb`, `.rpm`, and AppImage downloads are also available. See the [complete installation guide](v2/README.md#installation).

## Two product lines

This repository contains two independent generations of Skriuw:

| Line   | Status        | Best for                                              | Source                                      |
| ------ | ------------- | ----------------------------------------------------- | ------------------------------------------- |
| **v2** | Current       | Private, local-first writing (desktop and browser)    | [`v2/`](v2)                                 |
| **v1** | Frozen legacy | Web, mobile, sharing, collaboration, and self-hosting | [`apps/`](apps) and [`packages/`](packages) |

Package-manager channels and the latest GitHub release install v2. The v2 browser app runs at [skriuw.com/app](https://skriuw.com/app), and the bare domain redirects there. v1 is no longer hosted at skriuw.com but can still be self-hosted with Docker.

## Architecture

v2 separates product rules from storage and platform code:

```text
React + ProseMirror
        │
 versioned workspace operations
        │
serialized Rust runtime
        │
SQLite ─┴─ background Git history
```

SQLite owns canonical workspace state. The renderer applies user actions synchronously and submits durable operations to a serialized runtime queue. Git history, indexing, persistence, and opt-in cloud sync never sit on the navigation path.

Read the [v2 architecture](v2/ARCHITECTURE.md), [architecture decision records](v2/docs/adr), and [performance contract](v2/docs/performance-contract.md).

## Build from source

### v2 desktop

Requirements: Rust 1.95, Bun 1.3, Node.js 24, Bash, and the platform dependencies required by Tauri.

```bash
cd v2
./scripts/bootstrap.sh
./scripts/check.sh
./scripts/build.sh desktop
```

The [v2 developer guide](v2/README.md) lists every build, test, generation, and CLI command.

### v1 web

```bash
bun install
cp .env.example .env.local
bun dev
```

Configure the required database and authentication variables described in the [environment documentation](apps/documentation/content/docs/infra/environment-variables.mdx). For a server deployment, use the [self-hosting guide](apps/documentation/content/docs/infra/self-host-docker.mdx).

## Repository structure

```text
v2/                    current Rust, React, and Tauri desktop application
apps/web/              v1 Next.js application
apps/mobile/           v1 Expo mobile application
apps/desktop/          v1 Tauri desktop shell
apps/documentation/    canonical documentation website source
packages/              shared v1 packages
.github/workflows/     CI and release automation
```

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and open a focused pull request with relevant tests.

Found a security issue? Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Skriuw is available under the [MIT License](LICENSE).
