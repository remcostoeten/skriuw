# Feature: Admin Seed Templates

## Overview

Allows admins to create template notes and folders that are automatically copied to new users on account creation.

## Changelog

### v1.0.0 (2025-12-13)

**Initial Release**

- Added `ADMIN_EMAILS` environment variable for admin identification
- Created `seedTemplateNotes` and `seedTemplateFolders` database tables
- Implemented `/api/admin/seed-templates` CRUD endpoints (admin-only)
- Implemented `/api/user/seed` endpoint for user seeding
- Integrated automatic seeding on email signup

## Configuration

```env
ADMIN_EMAILS="admin@example.com,other@example.com"
```

## API Reference

### GET `/api/admin/seed-templates`
Returns all seed template notes and folders.

### POST `/api/admin/seed-templates`
Create a new seed template.
```json
{
  "type": "note" | "folder",
  "name": "Template Name",
  "content": "<BlockNote JSON>",
  "parentFolderId": null,
  "pinned": 0,
  "order": 0
}
```

### PUT `/api/admin/seed-templates`
Update an existing seed template.

### DELETE `/api/admin/seed-templates?id=<id>&type=note|folder`
Delete a seed template.

### POST `/api/user/seed`
Seeds the current user with all templates (called on signup).

## Database Schema

```sql
-- seed_template_folders
id TEXT PRIMARY KEY
name TEXT NOT NULL
parent_folder_id TEXT
order INTEGER DEFAULT 0
created_at BIGINT
updated_at BIGINT

-- seed_template_notes
id TEXT PRIMARY KEY
name TEXT NOT NULL
content TEXT NOT NULL  -- BlockNote JSON
parent_folder_id TEXT
pinned INTEGER DEFAULT 0
order INTEGER DEFAULT 0
created_at BIGINT
updated_at BIGINT
```

## Files

| File | Purpose |
|------|---------|
| `lib/is-admin.ts` | Admin email checker |
| `lib/seed-user.ts` | User seeding utility |
| `app/api/admin/seed-templates/route.ts` | Admin CRUD API |
| `app/api/user/seed/route.ts` | User seed endpoint |
| `packages/db/src/schema.ts` | Database tables |

## Future Enhancements

- [ ] Admin UI page at `/admin/seed-templates`
- [ ] Bulk import from markdown files
- [ ] Template versioning
- [ ] Selective seeding (by user role)
