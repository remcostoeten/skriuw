# Journal navigation

How the journal moves between days from the keyboard: the scoped step
shortcuts and the "Go to date…" dialog with its date grammar.

| File | Role |
| --- | --- |
| `packages/renderer-core/src/journal/date-expressions.ts` | The grammar. Pure; takes the viewed day and today as arguments. |
| `packages/renderer-core/src/journal/dates.ts` | Calendar math over local `YYYY-MM-DD` keys (month/year clamping, Monday-first weeks). |
| `apps/workspace/src/features/journal/navigation.ts` | Writes the destination into the route hash and carries the open-dialog request. |
| `apps/workspace/src/features/journal/go-to-date-dialog.tsx` | The dialog, built on the shared `Dialog`. |
| `apps/workspace/src/commands/definitions.ts` | Default bindings. |

## Step shortcuts

All bindings live in the `Journal` group, require the `journal` scope, and
carry the `typing` and `modal` guards: they never fire while the caret is in the
entry, in a text field, or behind an open dialog.

| Action | Default |
| --- | --- |
| Previous / next day | `[` / `]` |
| Previous / next week | `Shift+[` / `Shift+]` |
| Previous / next month | `Alt+[` / `Alt+]` |
| Previous / next year | `Alt+Shift+[` / `Alt+Shift+]` |
| Go to date… | `d` |
| Today | `t` |
| Search entries | `/` |

The bracket family keeps every step on the main block of a 60% keyboard, with
no Home, End, PageUp, or PageDown. Browsers, WebKitGTK, and the editor do not
claim these chords. The editor does not see them either, because none of them
fire while typing. On macOS Option+bracket types a character, so the chords
match on the physical key code (`shortcutMatchesPhysicalKey`) as well.
`d` stays clear of `g`, which starts the `g then t then <n>` rail sequences.

Months and years keep the day of the month and clamp to the end of shorter
months: January 31 plus a month is February 28 (29 in leap years), and
February 29 plus a year is February 28.

Every binding is rebindable in Settings → Shortcuts. The recorder reports a
collision through `findShortcutConflict`, which treats ownership as global.
Moving "Next month" onto `]` therefore warns that "Next day" owns it. The same
rows show in the `mod+/` cheat sheet with their effective combos.

Stepping writes the new day into the route hash synchronously. The entry pane
reacts to the route like any other day change and waits on no I/O. The editor's
save pipeline flushes the previous entry exactly as it does for `[`/`]`.

## Go to date… dialog

- `d`, or the palette command, opens the dialog for the day being viewed. Closed,
  it renders nothing and subscribes to nothing. Each open mounts a fresh body.
- While the field is empty, a suggestion listbox shows one example per grammar
  shape. Each suggestion shows its resolved date for the viewed day. Arrow keys
  move through the list, Shift+Arrow jumps to either end, and Enter goes.
- While typing, a `role="status"` line under the field previews the exact
  destination: a long date for a day, and for a month or year its title plus
  the day it opens. If the input does not resolve, the line shows the parser's
  message and the field is marked `aria-invalid`.
- Enter goes only when the expression resolves. Escape closes without
  navigating, and focus returns to where it was.
- Month and year destinations open their first day, the same day the sidebar
  calendar shows when you page to that month.

## Grammar

`resolveJournalDateExpression(input, context, today)` returns
`{ ok: true, key, granularity: "day" | "month" | "year", label }` or
`{ ok: false, message }`. It never throws. Input is trimmed, lowercased, and
whitespace-collapsed.

The two arguments do different jobs:

- **`context`** is the day the journal is showing. It anchors every relative
  term and supplies the year when an expression leaves it out.
- **`today`** anchors only `today`, `now`, `yesterday`, and `tomorrow`, and it
  places two-digit years.

### Numbers

Separators are `-`, `/`, `.`, and spaces.

| Input | Reading | Example with context 2026-09-15 |
| --- | --- | --- |
| `D` or `DD` | Day of the viewed month | `7` → 2026-09-07 |
| `MDD` | Month and day | `312` → 2026-03-12 |
| `MMDD` | Month and day | `0312`, `1231` |
| `YYYY` from 1900 to 2999 | Year | `2025` → 2025-01-01 (year) |
| `YYYYMMDD` | ISO date | `20251203` |
| `M/D` | Month and day | `3/12` → 2026-03-12 |
| `M/YYYY` or `YYYY/M` | Month | `12/2025` → 2025-12-01 (month) |
| `D/M/YYYY` or `D/M/YY` | Day, month, year | `2-12-2025` → 2025-12-02 |
| `YYYY/M/D` | ISO date | `2025-12-02` |

**Date order.** Two numbers read month then day, and three numbers read day,
month, then year unless the first number has four digits. That asymmetry is
deliberate: it keeps both of the request's examples working (`3/12` as March 12
and `2-12-2025` as December 2). The preview always shows the resolved date, so
an unexpected reading is visible before Enter.

**Four-digit runs.** A bare four-digit run reads as a year only from 1900 to
2999, and as `MMDD` otherwise, so `1231` is December 31. A run that is neither
(`1899`) returns a message that names both readings. Other years can be written
unambiguously as `1850-06-01` or `jan 1850`.

**Two-digit years** fall in the hundred years ending 20 years after today. In
2026 the window is 1947–2046, so `2-12-25` is 2025 and `2-12-70` is 1970.

**Year range.** Every destination must fall from year 1000 to 9999, including
destinations reached by relative offsets. A year written with one, three, or
five or more digits (`1/1/202`, `1/1/20255`) asks for two or four digits.
Out-of-range years (`0999-01-01`, `0025-01-01`, `in 99999 years`) return a
message quoting the year as typed. Impossible days such as `2/30` or
`2025-02-29` are rejected, never rolled over.

### Words

| Input | Resolves from | Result |
| --- | --- | --- |
| `today`, `now`, `yesterday`, `tomorrow` | today | Day |
| `thu`, `this thursday` | context | That weekday in the viewed Monday-first week |
| `next thu`, `next week thursday` | context | That weekday in the following week |
| `last thu`, `last week thursday` | context | That weekday in the previous week |
| `next day`, `last week`, `next month`, `this year` | context | Same day stepped by one unit (clamped) |
| `in 3 days`, `2 weeks ago` | context | Counted step (clamped) |
| `december`, `this december` | context year | Month |
| `next march`, `last march` | context | The next or previous occurrence of that month, strictly after or before the viewed month |
| `dec 12`, `12 dec`, `december 12 2025`, `12 december 2025` | context year unless given | Day |
| `dec 2025`, `2025 dec` | — | Month |

**Weekday rule.** `next <weekday>` always means that weekday in the next
Monday-first calendar week, identical to `next week <weekday>`. `last
<weekday>` is the same rule one week back. A bare weekday names the day in the
viewed week, so on a Tuesday `thu` is two days ahead and `mon` is yesterday. One
rule for all three forms avoids having "next Thursday" and "next week Thursday"
disagree on some days and not others.

Month and weekday names match any unambiguous prefix of at least three letters
(`sept`, `thurs`), plus `tues` and `weds`. `previous`/`prev` and `current` are
synonyms for `last` and `this`.
