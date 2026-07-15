# Full ICS Calendar Implementation Prompt

Implement production-ready calendar interoperability for Skriuw. Treat this document as an execution brief: inspect the existing codebase first, preserve current behavior, then implement, test, and document the complete import/export flow.

## Existing implementation

Journal ICS export already exists in the web frontend:

- `apps/web/src/features/journal/components/journal-sidebar.tsx` — export icon/button and dialog mount.
- `apps/web/src/features/journal/components/journal-ics-export-dialog.tsx` — client-side export dialog, all-entry/date-range selection, `.ics` download.
- `apps/web/src/domain/journal/ics-export.ts` — RFC 5545 serializer, all-day `VEVENT` generation, text escaping, line folding, mood/tag/person/body mapping.

Current behavior is download-only. No ICS import, recurring live feed, calendar connection, sync state, conflict resolution, or mobile export/import UI exists unless codebase inspection proves otherwise.

## Goal

Deliver a complete, reliable ICS feature for journal entries:

1. Export journal entries to valid `.ics` files.
2. Import `.ics` files into journal entries with preview and validation.
3. Offer a read-only subscription URL/feed for authenticated users, if compatible with current auth and product security model.
4. Support calendar interoperability without corrupting journal data, leaking private data, or creating duplicate entries.
5. Make feature usable from web and desktop surfaces where the shared web UI is available. Assess mobile separately; do not fake unsupported native file access.

## First steps

Before coding:

- Read repository and app instructions (`AGENTS.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`).
- Inspect journal models, actions, queries, auth, workspace tenancy, database schema, API/route conventions, toast patterns, file upload patterns, and existing tests.
- Confirm whether journal entries are private per user/workspace and how authorization is enforced.
- Check package dependencies. Prefer a well-maintained ICS parser for import if existing dependencies do not provide one; avoid unsafe `eval`-style parsing.
- Write a short implementation plan in the PR/task notes before changing code.

## Export requirements

Keep `buildJournalIcs` as the canonical serializer or refactor it without breaking its public contract.

- Generate RFC 5545-compatible UTF-8 output with CRLF line endings.
- Emit `VCALENDAR`, `VERSION:2.0`, stable `PRODID`, `CALSCALE:GREGORIAN`, and `METHOD:PUBLISH`.
- Emit one all-day `VEVENT` per selected journal entry.
- Use stable globally unique UIDs. Preserve UID stability across repeated exports.
- Use exclusive next-day `DTEND` for all-day events.
- Escape commas, semicolons, backslashes, and newlines correctly.
- Fold lines at 75 UTF-8 octets, never splitting a multibyte character.
- Include title/date, body, mood, tags, and resolved people in useful calendar fields.
- Define deterministic ordering by date, then stable entry ID.
- Define behavior for empty exports, malformed dates, missing timestamps, deleted entries, and very large exports.
- Add `X-WR-CALNAME` and any other interoperability fields only when standards-compatible and justified.
- Set download response/content type and `Content-Disposition` correctly for server routes.

## Import requirements

Build a safe import pipeline. Do not write imported records before user confirmation.

### Input

- Accept `.ics` upload from the journal UI.
- Validate file type and enforce a reasonable size limit.
- Parse VCALENDAR and VEVENT safely.
- Support folded lines, CRLF/LF input, escaped text, UTF-8, all-day events, and timed events.
- Handle `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `CATEGORIES`, `UID`, `LAST-MODIFIED`, and `DTSTAMP`.
- Clearly classify unsupported recurrence/time-zone/alarm/attachment fields.
- Never execute or interpret embedded content as code.

### Mapping

Map events into journal entries using explicit, documented rules:

- Date: all-day event start date; timed event converted using declared timezone or safe user timezone policy.
- Title: `SUMMARY`.
- Body: `DESCRIPTION`, after removing only Skriuw-owned metadata if round-tripping it.
- Tags: `CATEGORIES`, normalized through the existing canonical tag normalizer.
- Mood: recognize Skriuw export metadata only; never infer mood from arbitrary user text.
- People: resolve only supported Skriuw IDs/names; preserve unresolved values without silently linking the wrong person.
- UID/source metadata: persist enough information for duplicate detection and future re-import behavior.

### Preview

Show before commit:

- Total events found.
- New entries.
- Potential duplicates.
- Invalid/skipped events with human-readable reasons.
- Unsupported fields/warnings.
- Date/title/body preview for representative entries.
- Import mode: skip duplicates, update matching entries, or create duplicates. Default must be safe: skip duplicates.

### Commit

- Require explicit confirmation.
- Use existing journal actions and authorization checks.
- Make batch import transactional where database architecture allows.
- Avoid partial silent failure; return per-event results.
- Preserve existing entries unless user selected update/replace behavior.
- Revalidate all parsed data server-side. Do not trust client preview payload.
- Enforce workspace/user ownership on every mutation.

## Duplicate and round-trip rules

Define and test deterministic identity behavior:

- Prefer persisted source UID plus source/calendar identity.
- Fall back to a documented fingerprint only when UID is absent.
- Re-importing a Skriuw-generated export must not create duplicates under default mode.
- Updating an imported event must not overwrite a manually edited entry without explicit user choice.
- Decide how date/title changes affect identity and document it.
- Add metadata fields/migration only if needed; follow existing schema conventions.

## Live ICS feed

Assess and implement a secure read-only subscription endpoint if product scope supports it:

- Use opaque, revocable per-user/workspace feed tokens. Never expose session cookies or raw database IDs.
- Scope token to exactly one workspace/user.
- Allow token rotation/revocation from settings.
- Avoid indexing/caching private feeds publicly.
- Return `Content-Type: text/calendar; charset=utf-8` and suitable cache headers.
- Decide whether feed contains all journal entries or a configurable date window.
- Handle calendar client polling and token leakage risk in threat model/docs.
- Do not claim real-time sync; ICS subscriptions are client-polled and read-only.

If live feed is not appropriate for current architecture, explicitly document why and ship export/import without leaving dead UI.

## Frontend requirements

Extend the existing journal frontend rather than creating a disconnected flow:

- Keep export entry point in `journal-sidebar.tsx`.
- Add import action beside export with accessible label, tooltip, keyboard support, and disabled/loading states.
- Reuse the existing dialog, toast, button, input, and error-state conventions.
- Add import dialog with file picker, drag/drop if consistent with app patterns, preview state, warnings, confirmation, progress, result summary, and retry.
- Keep parsing/validation responsive for large files; use server-side parsing for sensitive or large inputs where appropriate.
- Expose feed URL/token controls in the most suitable existing settings area only if feed ships.
- Ensure dark mode, narrow widths, keyboard navigation, focus management, screen-reader labels, and no color-only status indicators.
- Add empty/loading/error states.
- Do not expose raw parser errors to users; log actionable diagnostic details safely.

## API and security

Follow existing Next.js route/action conventions. Enforce:

- Authentication and workspace authorization server-side.
- CSRF protections required by current mutation architecture.
- Upload size/type limits and request timeouts.
- Rate limits for import and feed access where existing infrastructure supports them.
- No cross-workspace data access through imported IDs, UIDs, people references, or feed tokens.
- No sensitive content in analytics events, logs, URLs, or error messages.
- Revocable feed tokens stored hashed when compatible with existing secret/token patterns.

## Testing

Add focused unit tests for:

- Export snapshots and RFC 5545 escaping.
- UTF-8 folding at boundary conditions.
- Date range filtering and deterministic ordering.
- Empty and malformed input.
- Parsing folded lines, escaped fields, all-day/timed events, line endings, and Unicode.
- Metadata round-trip.
- Duplicate detection and import modes.
- Authorization and cross-workspace rejection.
- Transaction/partial-failure behavior.
- Feed token rotation/revocation and response headers, if feed ships.

Add frontend tests for:

- Opening import/export UI.
- File validation.
- Preview counts and warnings.
- Confirmation and cancel behavior.
- Loading/error/success states.
- Accessibility basics and keyboard operation.

Run the narrowest relevant tests first, then typecheck/lint/build. Report commands and results. Fix failures caused by this work; distinguish unrelated baseline failures.

## Documentation

Update relevant docs with:

- Where export/import lives.
- Supported calendar fields and unsupported behavior.
- Duplicate rules.
- Privacy/security model.
- Feed setup, token rotation, and limitations if shipped.
- User instructions for Apple Calendar, Outlook, and Google Calendar.
- Known limitations and recovery behavior.

## Acceptance criteria

- Existing export still works.
- Exported files open in Apple Calendar, Outlook, and Google Calendar.
- Import preview never mutates data.
- User confirms before writes.
- Default re-import of Skriuw export creates zero duplicates.
- Invalid events produce visible reasons and do not corrupt valid entries.
- All writes pass server-side authorization.
- Tests cover parser, serializer, identity, security, and UI states.
- No dead controls, placeholder handlers, undocumented behavior, or unsupported sync claims remain.
- Final handoff lists changed files, migrations, commands run, test results, known limitations, and any follow-up work.
