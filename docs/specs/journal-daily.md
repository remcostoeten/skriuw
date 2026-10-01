# Journal daily entry

What a journal day offers beyond the editor: starting from a template,
recalling earlier entries that share the day, and stepping days by touch.
Keyboard navigation and the date grammar are in
[journal navigation](journal-navigation.md).

| File | Role |
| --- | --- |
| `apps/workspace/src/features/journal/journal-template.ts` | Template list, the remembered choice, and the plan that fills an entry. |
| `apps/workspace/src/features/journal/entry-starter.tsx` | The empty-entry affordance. |
| `apps/workspace/src/features/journal/on-this-day.ts` | Which earlier entries a day recalls, and their excerpts. Pure. |
| `apps/workspace/src/features/journal/on-this-day-section.tsx` | The section under the editor. |
| `apps/workspace/src/features/journal/day-swipe.ts` | The heading swipe recognizer. Pure. |
| `apps/workspace/src/features/journal/model.ts` | The entry projection both the sidebar and the section read. |
| `apps/workspace/src/features/journal/word-goal.ts` | The daily word goal history, progress milestones, and goal stats. Pure. |
| `apps/workspace/src/features/journal/word-goal-control.tsx` | The goal ring and menu in the day header. |

## Starting from a template

An entry with no words shows a starter one line under the caret. It offers
every built-in note template except the blank one, followed by the personal
templates saved from notes.

- Picking a template fills the entry and stores its id in the workspace
  setting `journalTemplateId`. The next empty day offers that template as a
  single **Start from …** press, with **Change template** beside it.
- A template is applied only by that press. Opening or browsing a day never
  applies one, so an unvisited day stays empty and out of the calendar dots,
  lists, stats, and streak.
- Date stamps (`{{date}}` in personal templates, the built-in date headings)
  use noon of the entry's own day, not the moment of the press.
- The fill is one `save_document` at the entry's current revision plus a
  `rename_node` from the first heading. It runs after pending editor work is
  flushed, retries once on a revision conflict, and refuses an entry that has
  gained words in the meantime. The open editor adopts it as a remote write.
- Template properties are not applied. The entry's date and mood properties
  belong to the journal, and a personal template saved from another entry
  carries its own copies of them.
- A remembered personal template whose source note is gone falls back to the
  plain **Start from a template** state. A corrupt saved-template list leaves
  the built-in templates available; the template picker reports the corruption.

## On this day

Under the editor, a day lists earlier entries that share it, nearest first:

| Label | Day |
| --- | --- |
| A week ago | seven days back |
| A month ago | the same day of the previous month, only when that day exists there |
| A year ago, _n_ years ago | the same month and day in every earlier year |

Only entries with words or a mood count, the same rule the calendar uses, and
only days before the viewed one. February 29 recalls earlier leap days only.
Each row shows the label, the date, the mood, and an excerpt of at most 160
characters with the title heading, Markdown syntax, and untouched template
placeholders removed. Activating a row opens that day.

The section is a projection over renderer state. `selectJournalEntries` keeps
its last result while the maps it reads keep their identity, so the sidebar and
the section share one pass and navigation does no I/O. When the section is
present the editor keeps a writing-sized minimum height instead of the notes
pane's 60vh, so the section stays near the first screen.

## Mood trend

The sidebar's Stats tab shows the last 30 days as one bar per day, oldest on
the left. A rated day's bar rises with its mood in five steps from rough to
great and takes the mood's colour; a day with an entry but no mood is a short
grey bar; a day without an entry is a hairline, so gaps stay visible. Today is
outlined. Every bar is a button named by its date and mood that opens that day.

Below the strip, one line summarises the window: "Mostly good" names the level
nearest the mean score (great 2, good 1, neutral 0, low -1, rough -2), followed
by "lifting lately", "dipping lately", or "holding steady" when the second half
of the window differs from the first by at least half a step, or by less than
that, respectively. The comparison needs two rated days in each half; before
then the line carries only the lead. With no rated day it reads "No moods
logged yet". Counts per mood follow, listing only the moods that occur.

The trend is a pure function over the projected entry list, so opening the
tab does no I/O.

## Word goal

`apps/workspace/src/features/journal/word-goal.ts` holds the goal history and
the goal statistics; `word-goal-control.tsx` is the header control.

The workspace setting `journalWordGoals` is a list of changes, each
`{ from: DateKey, words: number }`, where zero words turns the goal off. The
goal of a day is the latest change dated on or before it, so a change made
today applies from today on and every earlier day keeps the goal that applied
when it was written. A second change on the same day replaces the first, and
the list keeps at most 100 changes. Resetting preferences turns the goal off
from today without rewriting the history.

The history lives in settings rather than on each entry, so meeting a goal
writes nothing to the entry and typing never queues a property write.

- The header shows a 14px ring and "312 / 500" for a day that has a goal, and
  a dashed ring alone otherwise. Either opens a menu of Off, 250, 500, 750, and
  Custom, which turns the ring into a number field (Enter saves, Escape
  cancels). The menu always sets the goal from today.
- The count is the entry's saved word count from the store, the same number
  the footer shows. The goal adds no work to the keystroke path; it updates
  when the editor saves.
- A polite status region announces "Halfway to your 500 word goal." and
  "Word goal reached: 500 words." when a save crosses those points on the open
  day. Opening a day, switching days, or changing the goal primes the tracker
  without announcing.
- The Stats tab adds **Goal days** and **Goal streak** once a goal has ever
  been set. The streak counts consecutive met days ending today, or yesterday
  while today is still short. The journal calendar draws a goal day's entry dot
  as a short dash and names it in the day's label.

## Stepping days by touch

The entry header carries **Previous day** and **Next day** buttons, labelled
with the rebindable bracket shortcuts and 44px under a coarse pointer. A
horizontal swipe of at least 64px across the header steps a day: pulling right
opens the previous day, pulling left the next. A drag that locks to the
vertical axis steps nowhere, and the editor itself takes no swipe so text
selection and scrolling are untouched.

Below 900px the header, mood row, and paddings tighten: the five moods share
one row, and the gutters drop from 48px to 20px.
