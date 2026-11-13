# ADR-0063: Journal titles may be written by the model without review, behind a setting

- Status: accepted
- Date: 2026-11-13

## Context

A journal entry is created as "Untitled" and nothing in the journal page asks
for a title, so the entry list and search results fill up with rows that all
read the same. The existing "Suggest a title" action fixes one entry at a time:
open the day, start the action, accept the proposal. For a journal with years of
days that is hundreds of round trips.

[ADR-0036](0036-ai-results-are-reviewed-in-place.md) and
[ADR-0040](0040-ai-runs-are-visible-work.md) say model output is reviewed before
it is applied, and that a run is started by the writer and shown while it
happens. A bulk titling job fits neither rule as written.

## Decision

A workspace setting, `aiJournalTitles`, off by default, lets the default model
title journal entries on its own. It is the one place a completion is applied
without review, and it is bounded on every side:

- **What it writes.** Only the title of a journal entry whose title is still
  "Untitled", through the ordinary `rename_node` operation. The check runs again
  when the reply arrives, so a title typed meanwhile wins. Note bodies remain
  out of reach of any completion, as ADR-0036 requires.
- **What it reads.** Entries with at least twenty words, from days before today.
  Locked entries are never sent, and an entry over the action input limit is
  skipped instead of truncated.
- **How it runs.** `startJournalAutoTitles` lives inside the AI opt-in gate and
  sends one request at a time, newest entry first, with the library's title
  prompt, so a customised prompt applies here too. It wakes a moment after the
  store settles and does no work on the editing or navigation path.
- **How it stays visible.** Every request goes through the completion seam with
  the origin `journal:auto-title`, so it is listed in AI history and usage like
  any other run. A failed request pauses the job and says why in a toast; it
  resumes when the model or the setting changes, not by retrying into the same
  failure.

The setting's description states that entry text is sent to the default model.
Turning the setting on is the consent ADR-0033 asks for; turning AI off aborts
the job with the rest of the gate.

## Consequences

A generated title can be wrong and nobody is asked first. It is a rename, so it
is corrected like any other, and the job never touches an entry that already has
a title. Two devices with the setting on may both title the same entry before
they sync; the later rename wins.

Titles cost one request per entry, which on a metered provider is real spend
for a long journal. The usage panel shows it under its own origin.

Notes outside the journal are not covered. They have a title field in front of
the writer, and the review card remains the way to ask for one.
