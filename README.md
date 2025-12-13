**Skriuw** _(noun)_
/skrɪu̯/ — _Frisian, “to write.”_

A local-first desktop application for writing and organizing thoughts. Built with Tauri 2.0 and React, **Skriuw** blends note-taking and task management into a fast, private workspace with Markdown editing and offline access.

---

## Monorepo Setup

This project uses a modern monorepo setup with Bun workspaces, optimized for Vercel deployment.

### Structure

```
skriuw/
├── apps/
│   └── web/                 # Next.js web application
├── packages/
│   ├── db/                  # Database schema and utilities
│   ├── ui/                  # Shared UI components
│   └── core-logic/          # Core business logic
├── turbo.json               # Turborepo configuration
├── vercel.json              # Vercel deployment configuration
└── package.json             # Root package.json with workspace scripts
```

### Development

### OAuth2 Setup

For backup storage connectors, you'll need to set up OAuth2 apps:

**Dropbox:**

- Create app at https://www.dropbox.com/developers/apps
- Get `DROPBOX_CLIENT_ID` and `DROPBOX_CLIENT_SECRET`
- Required permissions: `account_info.read`, `files.metadata.write`, `files.content.write`

**Google Drive:**

- Create OAuth client at https://console.cloud.google.com/
- Get `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET`
- Enable Google Drive API
- Add redirect: `https://your-domain.com/api/storage/oauth2/callback/google-drive`

Also set `NEXT_PUBLIC_APP_URL` to your domain.

### Deployment

This monorepo is configured for Vercel deployment with:

- Bun as the package manager
- Turborepo for efficient builds
- Next.js framework detection
- Proper workspace dependency resolution

The root `vercel.json` handles the monorepo configuration, so individual app configurations are not needed.
