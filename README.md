<p align="center">
  <img src="public/icons/icon.png" alt="Skriuw" width="96" height="96">
</p>

<h1 align="center">Skriuw</h1>

<p align="center">
<strong>Skriuw</strong> <em>(noun)</em><br>
/skrɪu̯/ — <em>Frisian, "to write."</em>
</p>

<p align="center">
  <a href="https://github.com/remcostoeten/skriuw/releases"><img src="https://img.shields.io/github/v/release/remcostoeten/skriuw?style=flat-square&color=0a0a0a&labelColor=0a0a0a" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0a0a0a?style=flat-square&labelColor=0a0a0a" alt="MIT License"></a>
  <a href="https://skriuw.vercel.app"><img src="https://img.shields.io/badge/try-live%20demo-0a0a0a?style=flat-square&labelColor=0a0a0a" alt="Live Demo"></a>
  <a href="https://github.com/remcostoeten/skriuw/releases"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-0a0a0a?style=flat-square&labelColor=0a0a0a" alt="Platforms"></a>
</p>

---

<p align="center">
  <img src="public/screenshot.png" alt="Skriuw Interface" width="100%">
</p>

---

A note taking and productivity platform that adapts to how you want to work.

Cloud hosted, self hosted on your infrastructure, or running fully offline on your machine. Your data lives where you decide. Every feature is opt in. Nothing is forced. AI, sync, telemetry: all disabled by default until you choose otherwise.

---

## At a Glance

Skriuw covers the full spectrum from a simple personal notes app to a team knowledge base.

**Writing**  
Block based rich editor with slash commands, formatting toolbar, and raw MDX mode. Wikilinks (`[[Note Name]]`) with automatic backlink tracking. Tag mentions with `#tag` syntax. Code blocks with syntax highlighting via Prism. Tables, callouts, quotes, and embeds.

**Organization**  
Nested folder hierarchy with drag and drop. Pin and favorite notes. Archive and trash with recovery. Full text search across all content with advanced query syntax. Global command palette (Cmd+K) for quick navigation.

**Daily Workflow**  
Daily notes with configurable templates. Quick capture from anywhere. Journal workflow with date based organization. Auto open today's note on startup.

**Media & Assets**  
Cover images and icons per note. Image uploads via UploadThing, S3, or local storage. Asset library for managing all uploaded files.

**AI Integration**  
Bring your own API keys: OpenAI, Anthropic, Groq. Run local models via Ollama. Or disable AI entirely. It's opt in.

**Customization**  
Over 30 configurable settings across 10 categories: editor behavior, appearance, typography, note experience, daily notes, tags, shortcuts, backup, AI, and advanced options.

---

## Compared to Alternatives

| Capability                      |             Skriuw              |   Notion   |  Obsidian   |    Apple Notes     |
| ------------------------------- | :-----------------------------: | :--------: | :---------: | :----------------: |
| **Fully opt in features**       |               Yes               |     No     |   Partial   |         No         |
| **Cloud + self host + offline** |            All three            | Cloud only | Local only  |    iCloud only     |
| **Native desktop apps**         |          Tauri (Rust)           |  Electron  |  Electron   |       Native       |
| **BYOK database**               | PostgreSQL, SQLite, filesystem  |     No     | Filesystem  |         No         |
| **BYOK AI provider**            | OpenAI, Anthropic, Ollama, none | GPT-4 only |   Plugins   | Apple Intelligence |
| **Block based editor**          |               Yes               |    Yes     |     No      |         No         |
| **Wikilinks + backlinks**       |               Yes               |  Partial   |     Yes     |         No         |
| **Real time collaboration**     |             Planned             |    Yes     |     No      |        Yes         |
| **Open source**                 |               MIT               |     No     |   Partial   |         No         |
| **Offline PWA**                 |               Yes               |     No     |     N/A     |        N/A         |
| **Custom keyboard shortcuts**   |        25+ configurable         |  Limited   | Via plugins |         No         |
| **Daily notes / journaling**    |            Built in             |  Template  |   Plugin    |         No         |
| **Multi tab editing**           |               Yes               |  Limited   |     Yes     |         No         |

---

## Full Feature List

### Editor

Block based rich text editor (BlockNote), slash command menu with 15+ block types, floating formatting toolbar, wikilinks (`[[Note Name]]`) with backlink panel, tag mentions with `#tag` syntax, code blocks with 50+ language syntax highlighting, tables, callouts, quotes, dividers, cover images with positioning, note icons (emoji or custom), word wrap toggle, block indicator (drag handle), multi note tabs, raw MDX editing mode (Ctrl+M to toggle), centered layout with configurable max width.

### Note Experience

Six built in templates: empty, h1, h2, meeting, journal, project. Configurable title and body placeholders. Auto inherit folder icons. Default emoji assignment. Cover images (enable/disable).

### Daily Notes

Date based note generation. Four date format options. Dedicated journal folder. Auto open on startup option. Configurable daily note emoji.

### Search & Navigation

Full text search across content (opt in). Filename search (default). Advanced query syntax with operators. Global command palette (Cmd+K). Mobile search drawer. Unified search component.

### Keyboard Shortcuts

Over 25 customizable shortcuts. Platform aware (Cmd on Mac, Ctrl on Windows/Linux). Shortcut builder API for extensions. Visible in UI with Kbd component.

### Tags System

Inline `#tag` mentions. Tag management panel. Custom tag colors. Usage tracking across notes. Settings panel for tag customization.

### Backup & Export

Export to Markdown. Export to JSON. Import from Markdown files. Storage connectors for external sync. Trash with recovery.

### AI Features (BYOK)

Multiple provider support: OpenAI, Anthropic, Groq. Local models via Ollama. Provider abstraction layer. Fully opt in, disabled by default.

### Media & Uploads

Image uploads via UploadThing. S3 compatible storage support. Local filesystem storage (desktop). Upload adapter abstraction. Media picker component.

### Settings

Ten categories: Editor, Note Experience, Daily Notes, Appearance, Behavior, Tags, Shortcuts, Backup, AI, Advanced. Live preview for many settings. Validation with error messages. Conditional settings (show/hide based on other settings). Feature flags system.

### Authentication

Better Auth integration. OAuth providers. Session management. Account settings panel.

### Activity Tracking

Recent activity feed. Modification timestamps. Created/updated tracking.

---

## Architecture

```
skriuw/
├── apps/
│   └── web/                    # Next.js 15 application
│       ├── app/                # App Router pages and API routes
│       ├── components/         # Layout, sidebar, command palette
│       ├── features/           # Feature modules (15 total)
│       │   ├── account/        # User account management
│       │   ├── activity/       # Activity tracking
│       │   ├── ai/             # AI provider abstraction
│       │   ├── authentication/ # Auth flows
│       │   ├── backup/         # Import/export, storage connectors
│       │   ├── editor/         # BlockNote editor, MDX mode
│       │   ├── media/          # Media picker, asset management
│       │   ├── notes/          # Note CRUD, types, utilities
│       │   ├── quick-note/     # Quick capture
│       │   ├── search/         # Search components, query parser
│       │   ├── settings/       # 30+ settings, preview renderers
│       │   ├── shortcuts/      # Shortcut definitions, builder
│       │   ├── tags/           # Tag management
│       │   ├── tasks/          # Task management
│       │   └── uploads/        # Upload adapters
│       ├── lib/                # Search engine, utilities
│       ├── modules/            # PWA install module
│       └── src-tauri/          # Tauri desktop wrapper
│
├── packages/
│   ├── config/                 # Shared ESLint, TypeScript config
│   ├── crud/                   # Database CRUD operations
│   ├── db/                     # Drizzle schema, migrations
│   ├── env/                    # Environment variable validation
│   ├── shared/                 # Utilities, hooks, types
│   ├── style/                  # Base styles
│   └── ui/                     # 50+ UI components
│
└── scripts/                    # Development CLI, analyzers
```

---

## Development

### Prerequisites

Node.js 18+ or Bun 1.0+, PostgreSQL (for cloud/self hosted mode), Rust toolchain (for desktop builds).

### Quick Start

```bash
git clone https://github.com/remcostoeten/skriuw.git
cd skriuw
bun install
cp .env.example .env.local
# Configure DATABASE_URL and other variables
bun run dev
```

### Scripts

```bash
# Development
bun run dev              # Start Next.js dev server
bun run build            # Production build
bun run lint             # ESLint
bun run check-types      # TypeScript check
bun run test             # Run tests

# Desktop (Tauri)
bun run tauri:dev        # Tauri dev mode
bun run tauri:build      # Build for current platform
bun run tauri:build:mac  # Universal macOS build
bun run tauri:build:deb  # Debian package

# Database
bun run db:push          # Push schema to database
bun run db:studio        # Open Drizzle Studio

# Utilities
bun run seed:identity-guide      # Seed example notes
bun run scripts/dev-cli.ts       # Interactive dev CLI
```

### Dev CLI

The interactive dev CLI (`scripts/dev-cli.ts`) provides quick navigation to features, database utilities, code generation, dependency analysis, and unused file detection.

### Tooling

| Tool              | Purpose                           |
| ----------------- | --------------------------------- |
| **Bun**           | Package manager, runtime, bundler |
| **Turborepo**     | Monorepo build orchestration      |
| **Next.js 16**    | React framework with App Router   |
| **Tauri 2.0**     | Native desktop wrapper (Rust)     |
| **Drizzle ORM**   | Type safe database layer          |
| **BlockNote**     | Block based editor                |
| **Better Auth**   | Authentication                    |
| **React Query**   | Server state management           |
| **Zustand**       | Client state                      |
| **Framer Motion** | Animations                        |
| **GSAP**          | Advanced animations               |
| **UploadThing**   | File uploads                      |

---

## Deployment Options

### Cloud (Hosted)

Sign up at [skriuw.vercel.app](https://skriuw.vercel.app) and start writing. Data stored on our infrastructure with PostgreSQL.

### Self Hosted

Deploy to your own infrastructure:

```bash
git clone https://github.com/remcostoeten/skriuw.git
cd skriuw
cp .env.example .env.local
# Set DATABASE_URL to your PostgreSQL instance
# Configure auth providers as needed
bun install && bun run build && bun run start
```

Deployment guides available for: Vercel, Railway, Fly.io, Docker, Coolify.

### Desktop (Fully Offline)

Native apps with local SQLite or filesystem storage. No server required.

| Platform                  | Download                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| **macOS** (Apple Silicon) | [skriuw-x.x.x-aarch64.dmg](https://github.com/remcostoeten/skriuw/releases)   |
| **macOS** (Intel)         | [skriuw-x.x.x-x64.dmg](https://github.com/remcostoeten/skriuw/releases)       |
| **Windows**               | [skriuw-x.x.x-x64-setup.exe](https://github.com/remcostoeten/skriuw/releases) |
| **Linux** (AppImage)      | [skriuw-x.x.x.AppImage](https://github.com/remcostoeten/skriuw/releases)      |
| **Linux** (deb)           | [skriuw_x.x.x_amd64.deb](https://github.com/remcostoeten/skriuw/releases)     |
| **Linux** (rpm)           | [skriuw-x.x.x.rpm](https://github.com/remcostoeten/skriuw/releases)           |

### Package Managers

```bash
# macOS
brew tap remcostoeten/skriuw && brew install skriuw

# Arch Linux (AUR)
yay -S skriuw-bin

# Ubuntu/Debian
sudo add-apt-repository ppa:remcostoeten/skriuw
sudo apt update && sudo apt install skriuw

# Fedora
sudo dnf copr enable remcostoeten/skriuw && sudo dnf install skriuw

# Snap
sudo snap install skriuw

# Flatpak
flatpak install flathub app.skriuw.Skriuw

# Direct download
wget https://github.com/remcostoeten/skriuw/releases/latest/download/skriuw.AppImage
chmod +x skriuw.AppImage && ./skriuw.AppImage
```

---

## BYOK (Bring Your Own Keys)

Configure your own providers:

| Service      | Options                                                    |
| ------------ | ---------------------------------------------------------- |
| **Database** | PostgreSQL (cloud), SQLite (desktop), filesystem (desktop) |
| **AI**       | OpenAI, Anthropic, Groq, Ollama (local), or disabled       |
| **Storage**  | Vercel Blob, S3 compatible, UploadThing, local disk        |
| **Auth**     | GitHub OAuth, Google OAuth, email/password                 |

Set your keys in `.env.local` or in the desktop app settings.

---

MIT

xxx,  
[Remco Stoeten](https://remcostoeten-nl.vercel.app)

---

## 📚 Documentation

This project has comprehensive documentation organized in a central hub.

**Start Here**: [`/docs/README.md`](docs/README.md)

### Quick Links
- [Documentation Index](docs/INDEX.md) - Find any document
- [Feature Status](docs/STATUS.md) - What's shipped vs. planned
- [Architecture](docs/ARCHITECTURAL_DECISIONS.md) - Core design principles
- [Developer Guide](CLAUDE.md) - Commands, setup, tech stack

---
