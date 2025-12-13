# Admin Tools

Special features available to administrators for managing the application and users.

## Access
Admin features are visible only if your email is listed in the server configuration (`ADMIN_EMAILS`).
You will see a purple **ADMIN** badge in the Developer Widget (bottom right) if you have access.

## Features

### 1. Seed Templates
**Endpoint**: `/api/admin/seed-templates`

Administrators can manage the default notes and folders that are created for new users.
- **Create Template**: Define new default structure.
- **Update Template**: Modify existing onboarding content.

### 2. User Seeding
**Endpoint**: `/api/user/seed`

Automatically runs for new users, but Admins can trigger it manually for testing.
- Copies all "Seed Templates" to the target user's personal storage.
- Preserves folder hierarchy.
