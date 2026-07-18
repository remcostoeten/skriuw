# Journal ICS export & import

Calendar interoperability for journal entries is available in the shared web/Tauri UI through `.ics` files. Authenticated web users can also publish a revocable read-only subscription feed. On iPhone and iPad, the Expo app integrates directly with Apple Calendar instead of downloading a file.

## Where it lives

- UI entry point: the labeled **Calendar** menu in the journal sidebar header, with **Import .ics file**, **Export .ics file**, and (on web) **Live subscription** actions (`apps/web/src/features/journal/components/journal-sidebar.tsx`).
- Export dialog: `journal-ics-export-dialog.tsx`; serializer: `apps/web/src/domain/journal/ics-export.ts` (`buildJournalIcs`).
- Import dialog: `journal-ics-import-dialog.tsx`; parser/planner: `apps/web/src/domain/journal/ics-import.ts` (`parseJournalIcs`, `planJournalIcsImport`).
- Tests: `apps/web/__tests__/domain/journal/ics-export.test.ts` and `ics-import.test.ts`.

## Export

One all-day `VEVENT` per entry (exclusive next-day `DTEND`), UTF-8 with CRLF endings, lines folded at 75 octets without splitting multibyte characters, RFC 5545 TEXT escaping. The calendar wrapper carries `VERSION:2.0`, `PRODID:-//Skriuw//Journal//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, and `X-WR-CALNAME:Skriuw Journal`.

Field mapping:

| Journal field                            | ICS field                                                 |
| ---------------------------------------- | --------------------------------------------------------- |
| entry id                                 | `UID` = `<id>@skriuw` (stable across repeated exports)    |
| date                                     | `DTSTART;VALUE=DATE` / exclusive `DTEND;VALUE=DATE`       |
| title (+ mood label suffix)              | `SUMMARY`; untitled entries become `Journal — YYYY-MM-DD` |
| body + mood/tags/people frontmatter      | `DESCRIPTION`                                             |
| tags                                     | `CATEGORIES`                                              |
| updatedAt (fallback createdAt, then now) | `DTSTAMP` / `LAST-MODIFIED`                               |

Edge behavior: entries with malformed date keys are excluded from the file; ordering is deterministic (date, then entry id); an empty selection produces a bare, valid `VCALENDAR`. Export is client-side (`Blob` download, `text/calendar;charset=utf-8`) — no server route exists, so there are no additional response headers to configure.

## Import

Choose an `.ics` file (max 5 MB, `.ics` extension required) from the journal sidebar. The file is parsed locally with a purpose-built RFC 5545 parser — folded lines, CRLF/LF, escaped text, UTF-8, all-day and timed events; nothing in the file is ever evaluated as code. A preview shows total events, new entries, duplicates, skipped events with human-readable reasons, warnings, and sample rows. **Nothing is written until you confirm.**

Mapping rules:

- **Date**: all-day events use their start date; timed events are imported on the literal date of their `DTSTART` (time-of-day and time zones are dropped, with a visible warning). Multi-day events map to their start date only (warned).
- **Title**: `SUMMARY`. For Skriuw-origin events the mood suffix and the default `Journal — date` placeholder are stripped back off.
- **Body**: `DESCRIPTION`. Skriuw metadata frontmatter (mood/tags/people) is removed only on Skriuw-origin events (detected by the `@skriuw` UID suffix).
- **Tags**: `CATEGORIES` plus Skriuw frontmatter tags, run through the canonical tag normalizer, deduplicated.
- **Mood**: recognized from Skriuw export metadata only — never inferred from arbitrary text.
- **People**: exported people are names, which cannot be re-linked safely; they are preserved as a plain `People: …` line in the body instead of silently linking the wrong person.
- **Unsupported**: recurring (`RRULE`/`RDATE`) and cancelled events are skipped with reasons; alarms, attachments, and unusual text encodings produce warnings but do not block the event.

## Duplicate rules

The journal keeps **one entry per day**. Imported events with a UID also persist their calendar identity (`PRODID` plus calendar name) and UID, so a later import still recognizes an event that moved to another date.

- Default mode is **Skip duplicates**: any event whose date already has an entry is left untouched. Re-importing a Skriuw-generated export therefore creates zero duplicates.
- **Update existing** replaces the matching entry's title, body, tags, and mood — an explicit, clearly-warned choice (rich formatting on the existing entry is replaced by the imported plain text).
- A "create duplicates" mode is intentionally not offered: the one-entry-per-day model cannot hold two entries on a date.
- Two events on the same date within one file: the first wins, later ones are skipped with a visible reason.
- A moved external event is updated by UID. If its new date is occupied by another journal entry, it is skipped instead of overwriting that day.

## Privacy & security model

- Web import preview parsing happens on the client, then the original calendar text is parsed again by the authenticated server and applied in one database transaction. A failed batch rolls back completely. Desktop imports remain local to the vault and report individual failures with retry.
- Upload limits: `.ics` extension check and a 5 MB cap before the file is read, plus an independent server-side byte limit.
- Imported identities are always queried together with the authenticated user id and can never address another user's data.

## Live ICS feed

Authenticated web users can create a subscription URL from **Journal → Calendar → Live subscription**. The raw secret is shown only when created or rotated; the database stores its SHA-256 hash. Links can be rotated or revoked independently, and feed responses use `text/calendar`, `no-store`, `nosniff`, `no-referrer`, and `noindex` headers.

The feed is read-only and calendar apps choose their own refresh interval. Treat its URL like a password: anyone holding it can read journal event titles and descriptions. Creating and managing feed URLs remains web-only because the desktop vault has no public server. When the user explicitly enables desktop cloud sync, synced desktop journal entries are included in that web feed. File import/export continues to work without cloud sync.

## Automatic sync

### Inbound: subscribe to external calendars

**Journal → Calendar → Auto-import calendars** stores up to 5 external ICS URLs and imports their events into your journal roughly once a day. Where to find the URL:

- **Google Calendar**: Settings → your calendar → "Integrate calendar" → **Secret address in iCal format**. Treat it like a password. Google serves this feed with its own lag (up to ~12–24 h), so total freshness is "within a day".
- **Apple iCloud**: Calendar → share the calendar publicly → copy the `webcal://` link (accepted and rewritten to https).

Per-subscription import mode: **Never overwrite my entries** (default; a day that already has an entry is left untouched) or **Update matching entries** (reconciles by calendar UID and replaces the entry's text). Each row shows the last sync result and has Sync now / pause / delete controls.

- **Web**: subscriptions live in the database (`CalendarSubscription`); a Vercel cron (`/api/cron/sync-calendars`, daily at 05:00 UTC, guarded by `CRON_SECRET`) fetches each due URL server-side through an SSRF-guarded fetcher (`apps/web/src/lib/safe-fetch-ics.ts`: https-only, public-IP-only including redirect hops, 15 s timeout, 5 MB cap) and applies it via the transactional import pipeline.
- **Desktop**: subscriptions live in local storage (`skriuw.calendar.subscriptions.v1`); a background task (`DesktopCalendarSync`) checks hourly while the app runs and imports any subscription older than ~20 h straight into the vault. Some hosts without CORS headers may fail in the desktop webview; the row shows the error and the sync retries next cycle.

### Outbound: your journal in other calendars

- **Web**: the live feed (above) is the auto-sync path — calendar apps re-poll it themselves.
- **Desktop**: enable cloud sync, then use the web live feed; there is no local feed server.
- **iPhone/iPad**: Settings → Editor → **Auto-sync Apple Calendar** re-runs the Apple Calendar sync ~5 s after every journal save. It is off by default and never prompts for permission — run the manual Apple Calendar sync once first to grant access.

## Apple Calendar on iPhone and iPad

The mobile Journal header has a labeled **Apple Calendar** action. After the user grants iOS calendar access, Skriuw creates a dedicated **Skriuw Journal** calendar and reconciles journal entries into all-day events.

- The first sync creates events; later syncs update the same native event IDs instead of duplicating them.
- Removing a journal entry removes only its previously mapped Skriuw event. Unrelated calendars and events are never changed.
- If local sync state is cleared, identity is recovered from a private marker in each Skriuw event's notes.
- The direction is intentionally one-way: Skriuw is the source of truth. Edits made in Apple Calendar do not overwrite journal content and are replaced on the next manual sync.
- This uses the native `expo-calendar` module, so adding it requires a rebuilt iOS development/App Store binary; Expo web does not expose the action.

## Using exports with calendar apps

- **Apple Calendar**: double-click the `.ics` file, or File → Import; pick a target calendar.
- **Outlook**: File → Open & Export → Import/Export → Import an iCalendar file (or drag the file onto the calendar).
- **Google Calendar**: Settings → Import & export → Import, select the file and a destination calendar.

## Known limitations & recovery

- Recurring events are skipped rather than expanded; timed events lose their time-of-day.
- "Update existing" replaces rich text content with plain text; recover through the entry's version history where available, or re-edit.
- Person mentions do not round-trip as live links (preserved as text).
- Desktop import writes sequentially to the local vault and can retry individual failures. Authenticated web imports are atomic.
