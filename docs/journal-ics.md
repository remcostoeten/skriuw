# Journal ICS export & import

Calendar interoperability for journal entries, available anywhere the shared journal UI runs (web and the Tauri desktop app). Mobile has no `.ics` surface yet — the Expo app does not expose native file pickers for this flow, so nothing is faked there.

## Where it lives

- UI entry points: the up/down calendar-arrow buttons in the journal sidebar header (`apps/web/src/features/journal/components/journal-sidebar.tsx`).
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
| updatedAt (fallback createdAt, then now) | `DTSTAMP`                                                 |

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

The journal keeps **one entry per day**, so identity is the entry date (plus the original entry id for Skriuw-origin events). Because date is identity, no new schema/metadata columns were needed.

- Default mode is **Skip duplicates**: any event whose date already has an entry is left untouched. Re-importing a Skriuw-generated export therefore creates zero duplicates.
- **Update existing** replaces the matching entry's title, body, tags, and mood — an explicit, clearly-warned choice (rich formatting on the existing entry is replaced by the imported plain text).
- A "create duplicates" mode is intentionally not offered: the one-entry-per-day model cannot hold two entries on a date.
- Two events on the same date within one file: the first wins, later ones are skipped with a visible reason.
- The plan is recomputed against the live entry list at confirm time, so an entry created between preview and confirm becomes a skip, not an overwrite.

## Privacy & security model

- Import parsing happens on the client; every write goes through the existing per-mutation authorized journal actions (`createJournalEntry`/`updateJournalEntry` — server-side auth + per-user ownership on web, local vault on desktop). The server additionally revalidates the date key and mood on write, so a tampered client payload cannot store malformed values. Imported UIDs are used only for local duplicate matching — they are never used to address other users' data.
- Upload limits: `.ics` extension check and a 5 MB cap before the file is read.
- Failures are reported per event (created/updated/skipped/failed with retry); raw parser errors are not surfaced beyond safe messages.

## Live ICS feed — deliberately not shipped

A read-only subscription URL was assessed and cut from this iteration; export/import ship without any feed UI. Reasons:

1. Desktop journal entries live only in the local vault (SQLite/markdown) — a server feed could never include them, making the feature silently inconsistent across surfaces.
2. It requires new revocable hashed-token infrastructure plus a Prisma migration, and Vercel builds auto-apply migrations to production — too much blast radius to ride along with an import feature.
3. ICS subscriptions are client-polled and read-only; token-in-URL leakage (calendar clients sync URLs across devices/services) needs its own threat-model and settings/rotation UI to ship responsibly.

Follow-up shape if it is picked up: `JournalFeedToken` table (hashed token, per-user scope, rotation/revocation in settings), `GET /api/journal/feed/[token]` returning `text/calendar; charset=utf-8` with `Cache-Control: private, no-store`, and a configurable date window.

## Using exports with calendar apps

- **Apple Calendar**: double-click the `.ics` file, or File → Import; pick a target calendar.
- **Outlook**: File → Open & Export → Import/Export → Import an iCalendar file (or drag the file onto the calendar).
- **Google Calendar**: Settings → Import & export → Import, select the file and a destination calendar.

## Known limitations & recovery

- Recurring events are skipped rather than expanded; timed events lose their time-of-day.
- "Update existing" replaces rich text content with plain text; recover through the entry's version history where available, or re-edit.
- Person mentions do not round-trip as live links (preserved as text).
- Import writes sequentially through the standard actions (not one transaction); a mid-import failure reports exactly which events failed and offers a retry of only those.
