# Feature: Storage & Backup

## Overview

A multi-provider storage system designed to back up user notes and data to external cloud providers (Google Drive, Dropbox) or local storage (for desktop/Tauri users).

## Changelog

### v0.0.1 (Alpha)

**Initial Implementation**

- Core backup engine structure
- OAuth2 flow for Google Drive and Dropbox
- Encryption support for connector secrets
- Local storage driver for Tauri

## Architecture

The backup system is modular, consisting of:

- **Engine**: Orchestrates the backup process (`features/backup/core/engine.ts`).
- **Connectors**: Handle authentication and API communication with specific providers.
- **Drivers**: Low-level file system operations (if applicable).

### Providers

1. **Google Drive**
    - OAuth2 flow
    - Scope: `drive.file` (app data folder only)
2. **Dropbox**
    - OAuth2 flow
    - App folder access

3. **Local (Tauri)**
    - OS-native file system access
    - Requires Tauri allowlist configuration

## Security

### Encryption

Sensitive data (like refresh tokens) should be encrypted before storage.

- **Env**: `CONNECTOR_ENCRYPTION_KEY`
- **Fallback**: `BETTER_AUTH_SECRET`

## Configuration

Ensure the following environment variables are set:

```env
# Google
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...

# Dropbox
NEXT_PUBLIC_DROPBOX_CLIENT_ID=...
DROPBOX_CLIENT_SECRET=...

# Encryption
CONNECTOR_ENCRYPTION_KEY=...
```

## Future Plans

- Automated background backups (Cron/Service Worker)
- Versioning support for backups
- "Restore" UI flow (currently backup-only or manual restore)
