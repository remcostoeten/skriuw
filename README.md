<p align="center">
  <img src="apps/web/public/icons/128x128.png" width="88" alt="Skriuw logo" />
</p>

<p align="center">
  <strong>Skriuw</strong> <em>(noun)</em><br />
  /skrɪu̯/, <em>Frisian, “to write.”</em>
</p>

<p align="center">
  <a href="https://github.com/remcostoeten/skriuw/releases"><img src="https://img.shields.io/github/downloads/remcostoeten/skriuw/total?label=downloads&logo=github" alt="GitHub release downloads" /></a>
  <img src="https://img.shields.io/badge/platforms-web%20%7C%20macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20iOS%20%7C%20Android-4c6ef5" alt="Supported platforms: web, macOS, Windows, Linux, iOS, and Android" />
  <img src="https://img.shields.io/badge/package%20managers-Homebrew%20%7C%20winget%20%7C%20Scoop%20%7C%20AUR%20%7C%20Snap%20%7C%20apt%20%7C%20dnf-f59e0b" alt="Available through Homebrew, winget, Scoop, AUR, Snap, apt, and dnf" />
  <img src="https://img.shields.io/badge/release%20assets-DMG%20%7C%20EXE%20%7C%20DEB%20%7C%20RPM%20%7C%20AppImage-737373" alt="Direct downloads are available as DMG, EXE, DEB, RPM, and AppImage files" />
  <img src="https://img.shields.io/badge/self--host-Docker-2496ED?logo=docker&logoColor=white" alt="Self-host with Docker" />
</p>

<p align="center">
  <b>Open source note-taking, journaling, and knowledge base for web, mobile, and desktop.</b>
</p>

<p align="center">
  Markdown notes, wiki-style links, backlinks, tags, daily journaling, and optional bring-your-own-key AI. A calm, fast, keyboard-driven Notion and Obsidian alternative built with Next.js, PostgreSQL, and Tauri.
</p>

<p align="center">
  <img src="apps/web/public/readme/app-main.png" alt="Skriuw notes workspace showing the Markdown editor, sidebar, and note links" />
</p>

## A place to think in public or in private

Skriuw brings notes, a daily journal, and lightweight planning into one calm workspace. It is for people who want to stay with their thoughts, not hunt through menus or rearrange a dashboard.

The surface stays quiet until you need more: links between ideas, rich and Markdown editing, a command palette, or optional AI. Use Skriuw in the browser, on your phone, as a local-first desktop app, or on infrastructure you control.

> [!NOTE]
> AI is optional. Bring your own provider key or use the app's fallback keys. User keys are encrypted at rest.

## Keep the whole thread

| Area           | What it gives you                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Notes          | Rich text and Markdown modes, wiki-style note links, backlinks, tags, folders, and version history. |
| Journal        | Calendar-based daily entries with moods, tags, autosave, and quick navigation.                      |
| Knowledge base | Wikilinks and backlinks connect notes into a browsable, searchable graph.                           |
| Sharing        | Frozen note snapshots with optional passwords, expiry, and view-once access.                        |
| AI (BYOK)      | Title generation, spell check, and continue-writing actions with your own API key.                  |
| Planning       | A public roadmap board for features, issues, and upcoming work.                                     |
| Control        | Export, import, account deletion, themes, typography, and editor preferences.                       |

## See the workspace

<table>
  <tr>
    <td width="50%">
      <img src="apps/web/public/readme/notes-workspace.png" alt="Skriuw notes workspace" />
    </td>
    <td width="50%">
      <img src="apps/web/public/readme/journal-workspace.png" alt="Skriuw daily journal with calendar and moods" />
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="apps/web/public/readme/planning-board.png" alt="Skriuw project planning and roadmap board" />
    </td>
  </tr>
</table>

## Stay with the thought

- Move through the app from the keyboard, with a command palette and quick search close at hand
- Switch between rich text and Markdown without leaving the same workspace
- Keep the interface out of the way, so the writing surface has room to breathe
- Read and work from a local cache, with AI private by default

## Your words, your terms

- Your notes and journal entries live in your own database-backed account
- Shared notes are frozen snapshots, not live views of the source document
- AI provider keys are encrypted at rest when stored in the app
- You can export your workspace and delete your account from inside the app

## Bring your library with you

Skriuw uses a portable ZIP backup format for your workspace:

- Export from **Settings → Data & sync** downloads `skriuw-export-YYYY-MM-DD.zip`
- Import supports **merge** (skip duplicates), **overwrite** (update matches), or **replace workspace**

Third-party imports (best effort, structure and formatting may need cleanup):

| Source           | What to upload                    | Notes                                                               |
| ---------------- | --------------------------------- | ------------------------------------------------------------------- |
| Obsidian         | Vault ZIP                         | Wikilinks converted to Markdown links; `.obsidian` metadata skipped |
| Apple Notes      | HTML export ZIP                   | Plain text and Markdown body; attachments not included              |
| Bear             | Markdown export ZIP               | Header `#tags` mapped to note tags                                  |
| Notion           | Markdown export ZIP               | Databases, CSVs, and attachments skipped                            |
| Simplenote       | Export ZIP                        | Titles derived from first line; trashed notes land in Trash         |
| Desktop snapshot | Snapshot ZIP from the desktop app | Notes, folders, journal entries, and journal tags                   |
| Markdown folder  | Any folder ZIP                    | Generic path-based import when auto-detect is unsure                |

Use **Auto-detect** in Settings when you are not sure which profile fits.

Archive layout:

```text
skriuw-export-YYYY-MM-DD/
├── skriuw-export.json
├── notes/
│   ├── [folders/]note-name.md
│   └── [folders/]note-name.rich.json
├── journal/
│   └── YYYY-MM-DD.md
└── versions/
    └── {noteId}/{versionId}.json
```

## Built to last

Next.js, Expo/React Native, PostgreSQL with Prisma, Better Auth, Tauri for the
desktop build, and a block-based editor with real-time collaboration. Managed
with Bun 1.3.14 in a monorepo.

## Choose where Skriuw lives

Whether you want the convenience of the web app, a private server, or a folder of plain Markdown files on your own machine, there is a version of Skriuw for that.

| Mode                                   | Storage                                  | How you get it                         | Best for                                              |
| -------------------------------------- | ---------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| **Cloud**                              | Postgres (hosted)                        | Visit [skriuw.com](https://skriuw.com) | Just want to write, nothing to install                |
| **Mobile**                             | Cloud account + offline read cache       | Expo development build                 | Notes and journal across phone and web                |
| **Self-host (Docker)**                 | Postgres                                 | `docker pull` + Compose (below)        | A server / homelab instance you own, multi-device     |
| **Desktop**                            | Markdown vault + SQLite (local, offline) | Native installer                       | Local-first, no server, no account                    |
| _Self-host local-first vault (Docker)_ | Markdown vault + SQLite                  | _coming soon_                          | Homelab users who want plain `.md` files, no Postgres |

### Self-host with Docker

Runs the web app plus a Postgres container. No repo clone needed, just two files:

```bash
# 1. Grab the compose file and env template
curl -O https://raw.githubusercontent.com/remcostoeten/skriuw/daddy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/remcostoeten/skriuw/daddy/.env.example

# 2. Set the two required secrets in .env
#    BETTER_AUTH_SECRET and AI_KEYS_ENCRYPTION_SECRET
#    (each: openssl rand -base64 32). Leave the rest at their defaults.

# 3. Start: pulls ghcr.io/remcostoeten/skriuw + postgres:17, runs migrations
docker compose up -d
```

Open `http://localhost:3000`. Data persists in the `skriuw-db` volume. The entrypoint fails fast with a clear message if a required secret is missing or still a placeholder.

**Bring your own Postgres** (Neon, RDS, an existing box): drop the `db` service and point `DATABASE_URL` at it.

**Custom domain:** `NEXT_PUBLIC_*` values (auth URL, etc.) are baked into the image at build time, so the published image only works cleanly on `http://localhost:3000`. To serve a custom domain, build from source with your own values:

```bash
git clone https://github.com/remcostoeten/skriuw && cd skriuw
# set BETTER_AUTH_URL + NEXT_PUBLIC_BETTER_AUTH_URL in .env, then:
docker compose -f docker-compose.build.yml up --build -d
```

> Realtime collaboration is a Cloudflare Worker (`party/`) and is **not** part of the Docker stack. It stays disabled unless you deploy that worker and set `NEXT_PUBLIC_PARTYKIT_HOST`. Everything else works without it.

### Desktop

Native app (Tauri) with fully local, offline storage. Your notes are plain Markdown files plus a SQLite index, with no server or account. Download from [Releases](https://github.com/remcostoeten/skriuw/releases), or:

```bash
# macOS (Homebrew): tap by URL, then install the cask
brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw && brew install --cask skriuw

winget install RemcoStoeten.Skriuw   # Windows
scoop bucket add skriuw https://github.com/remcostoeten/skriuw
scoop install skriuw                 # Windows, via Scoop
yay -S skriuw-bin                    # Arch (AUR)
sudo snap install skriuw             # Linux, via Snap
sudo dpkg -i skriuw_*.deb            # Debian/Ubuntu (from Releases)
```

## Work on Skriuw

Copy `.env.example` to `.env.local`, set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_BETTER_AUTH_URL`, then install and start the app:

```bash
bun install
bun dev
```

Run the mobile app with a development client:

```bash
bun mobile
bun mobile:check
```

## License

See [LICENSE](LICENSE).
