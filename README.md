<p align="center">
  <img src="apps/web/public/icons/128x128.png" width="88" alt="Skriuw logo" />
</p>

<h1 align="center">Skriuw</h1>

<p align="center">
  <b>Open source note-taking, journaling, and knowledge base for web and desktop.</b>
</p>

<p align="center">
  Markdown notes, wiki-style links, backlinks, tags, daily journaling, and optional bring-your-own-key AI. A calm, fast, keyboard-driven Notion and Obsidian alternative built with Next.js, PostgreSQL, and Tauri.
</p>

<p align="center">
  <i>Skriuw is Frisian for "to write."</i>
</p>

<p align="center">
  <img src="apps/web/public/readme/app-main.png" alt="Skriuw notes workspace showing the Markdown editor, sidebar, and note links" />
</p>

## What is Skriuw

Skriuw is a privacy-first writing app that keeps your notes, daily journal, and lightweight roadmap planning in one workspace. It is built for people who want a quiet interface, fast keyboard-driven navigation, and a plain path for thinking and drafting without friction.

Everything is minimal by default and feature-rich when you opt in. It runs in the browser and as a native desktop app, and you can self-host it.

> [!NOTE]
> AI is optional. Bring your own provider key or use the app's fallback keys. User keys are encrypted at rest.

## Features

| Area           | What it gives you                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Notes          | Rich text and Markdown modes, wiki-style note links, backlinks, tags, folders, and version history. |
| Journal        | Calendar-based daily entries with moods, tags, autosave, and quick navigation.                      |
| Knowledge base | Wikilinks and backlinks connect notes into a browsable, searchable graph.                           |
| Sharing        | Frozen note snapshots with optional passwords, expiry, and view-once access.                        |
| AI (BYOK)      | Title generation, spell check, and continue-writing actions with your own API key.                  |
| Planning       | A public roadmap board for features, issues, and upcoming work.                                     |
| Control        | Export, import, account deletion, themes, typography, and editor preferences.                       |

## Screenshots

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

## Why it feels fast

- Keyboard-first navigation
- Command palette and quick search
- Rich and Markdown editor modes in the same workspace
- Minimal chrome around the writing surface
- Local-first caching and private-by-default AI

## Privacy and control

- Your notes and journal entries live in your own database-backed account
- Shared notes are frozen snapshots, not live views of the source document
- AI provider keys are encrypted at rest when stored in the app
- You can export your workspace and delete your account from inside the app

## Backup and import

Skriuw uses a portable ZIP backup format for your workspace:

- Export from **Settings → Data & sync** downloads `skriuw-export-YYYY-MM-DD.zip` (v3)
- v3 adds SHA-256 checksums, optional note version history, and import policies
- Import supports **merge** (skip duplicates), **overwrite** (update matches), or **replace workspace**
- Legacy v1 and v2 Skriuw exports still import

Third-party imports (best effort, structure and formatting may need cleanup):

| Source          | What to upload      | Notes                                                               |
| --------------- | ------------------- | ------------------------------------------------------------------- |
| Obsidian        | Vault ZIP           | Wikilinks converted to Markdown links; `.obsidian` metadata skipped |
| Apple Notes     | HTML export ZIP     | Plain text and Markdown body; attachments not included              |
| Bear            | Markdown export ZIP | Header `#tags` mapped to note tags                                  |
| Notion          | Markdown export ZIP | Databases, CSVs, and attachments skipped                            |
| Markdown folder | Any folder ZIP      | Generic path-based import when auto-detect is unsure                |

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

## Tech stack

Next.js, PostgreSQL with Prisma, Better Auth, Tauri for the desktop build, and a block-based editor with real-time collaboration. Managed with Bun in a monorepo.

## Run locally

Copy `.env.example` to `.env.local`, set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_BETTER_AUTH_URL`, then install and start the app:

```bash
bun install
bun dev
```

## License

See [LICENSE](LICENSE).
