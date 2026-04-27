# Analytics Implementation

This document describes the analytics events tracked in skriuw and how to query them from the dashboard.

## Database Schema

The analytics events are stored in the `events` table with the following structure:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Unique event ID |
| `type` | text | Event type: 'pageview', 'event', 'click', 'error' |
| `project_id` | text | Project identifier |
| `path` | text | Page path |
| `referrer` | text | Referring URL |
| `host` | text | Hostname |
| `origin` | text | Origin URL |
| `visitor_id` | uuid | Unique visitor identifier |
| `session_id` | uuid | Session identifier |
| `ts` | timestamptz | Event timestamp |
| `meta` | jsonb | Custom metadata |
| `country` | text | Visitor country (enriched) |
| `city` | text | Visitor city (enriched) |
| `region` | text | Visitor region (enriched) |
| `is_localhost` | boolean | Whether event is from localhost |
| `is_preview` | boolean | Whether event is from a preview deploy |

## Events Tracked

### Notes Events
- `note_created` - When a new note is created
- `note_deleted` - When a note is deleted
- `note_updated` - When a note is updated

### Journal Events
- `journal_entry_created` - When a new journal entry is created
- `journal_entry_deleted` - When a journal entry is deleted
- `journal_entry_updated` - When a journal entry is updated
- `mood_logged` - When a mood is logged to an entry
- `tag_created` - When a new tag is created
- `tag_deleted` - When a tag is deleted

### Auth Events
- `user_signed_in` - When user signs in (includes `method: "password" | "oauth"`)
- `user_signed_up` - When user signs up (includes `method: "password" | "oauth"`)
- `user_signed_out` - When user signs out
- `oauth_initiated` - When OAuth flow is initiated (includes `provider`)

### UI Events
- `sidebar_toggled` - When sidebar is toggled (includes `isOpen: boolean`)
- `theme_changed` - When theme is changed (includes `theme: string`)
- `workspace_switched` - When workspace is switched (includes `workspaceId`)

### Search Events
- `search_executed` - When a search is performed (includes `query`, `resultCount`)
- `search_result_clicked` - When a search result is clicked (includes `query`, `resultIndex`)

### Sync Events
- `sync_started` - When sync begins
- `sync_completed` - When sync completes successfully
- `sync_failed` - When sync fails (includes `error`)

## Implementation

### Analytics Library
Location: `src/shared/lib/analytics.ts`

This module exports:
- `AnalyticsEvents` - Constants for all event names
- Helper functions for each event type (e.g., `trackNoteCreated`, `trackJournalEntryCreated`)
- Raw tracking functions: `track`, `trackEvent`, `trackClick`, `trackError`

### Usage Example
```typescript
import { trackNoteCreated } from "@/shared/lib/analytics";

// In a mutation callback
trackNoteCreated(noteId, { name: "My Note" });
```

### Where Events Are Triggered

| Hook/Module | Events |
|-------------|--------|
| `src/features/notes/hooks/use-create-note.ts` | `note_created` |
| `src/features/notes/hooks/use-delete-note.ts` | `note_deleted` |
| `src/features/journal/hooks/use-journal-hooks.ts` | `journal_entry_created`, `journal_entry_deleted`, `journal_entry_updated`, `mood_logged`, `tag_created`, `tag_deleted` |
| `src/platform/auth/index.ts` | `user_signed_in`, `user_signed_up`, `user_signed_out`, `oauth_initiated` |

## Dashboard Queries

The analytics API exposes metrics at `/api/analytics?metric=EVENTS&projectId=skriuw`. For custom queries, connect directly to the database.

### Recommended Dashboard Queries

> [!NOTE]
> The custom event name is stored in `meta->>'eventName'`, not `meta->>'type'`.

1. **Notes created per day:**
```sql
SELECT date_trunc('day', ts) as day, count(*) as notes_created
FROM events
WHERE type = 'event' 
  AND meta->>'eventName' = 'note_created'
  AND project_id = 'skriuw'
GROUP BY day 
ORDER BY day DESC;
```

2. **Active users (unique visitorIds) per day:**
```sql
SELECT date_trunc('day', ts) as day, count(distinct visitor_id) as active_users
FROM events
WHERE project_id = 'skriuw'
GROUP BY day 
ORDER BY day DESC;
```

3. **Most used features (event counts):**
```sql
SELECT meta->>'eventName' as event_name, count(*)
FROM events
WHERE type = 'event' AND project_id = 'skriuw'
GROUP BY event_name 
ORDER BY count DESC;
```

4. **Auth method breakdown:**
```sql
SELECT 
  meta->>'eventName' as auth_event,
  meta->>'method' as method, 
  count(*) as count
FROM events
WHERE type = 'event' 
  AND project_id = 'skriuw'
  AND meta->>'eventName' IN ('user_signed_in', 'user_signed_up')
GROUP BY auth_event, method
ORDER BY count DESC;
```

5. **Search usage:**
```sql
SELECT 
  meta->>'query' as search_query,
  meta->>'resultCount' as result_count,
  count(*) as times_searched
FROM events
WHERE type = 'event' 
  AND meta->>'eventName' = 'site_search'
  AND project_id = 'skriuw'
GROUP BY search_query, result_count
ORDER BY times_searched DESC 
LIMIT 20;
```

6. **Journal entries over time:**
```sql
SELECT 
  date_trunc('day', ts) as day,
  meta->>'eventName' as event_type,
  count(*) as count
FROM events
WHERE type = 'event' 
  AND project_id = 'skriuw'
  AND meta->>'eventName' IN ('journal_entry_created', 'journal_entry_deleted', 'journal_entry_updated')
GROUP BY day, event_type
ORDER BY day DESC;
```

7. **User sessions (last 7 days):**
```sql
SELECT 
  date_trunc('day', ts) as day,
  count(distinct session_id) as sessions,
  count(distinct visitor_id) as unique_visitors,
  count(*) as total_events
FROM events
WHERE ts >= now() - interval '7 days'
  AND project_id = 'skriuw'
GROUP BY day
ORDER BY day DESC;
```

## Future Enhancements

Potential events to add:
- Editor: `block_added`, `block_deleted`, `text_typed`, `slash_command_used`
- Sync tracking is not yet implemented - need to find the sync module
- Error boundary tracking with `trackError()`