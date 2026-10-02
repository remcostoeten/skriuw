# ADR-0054: Recurring tasks repeat in the document

- Status: accepted
- Date: 2026-10-01

## Context

[ADR-0053](0053-task-due-dates-live-in-the-checklist-line.md) put a task's due
date on its checklist line so Markdown, exports and other editors keep it. A
repeating chore ("water the plants every week") needs a rule as well as a date,
and completing it has to leave a record that it was done while scheduling the
next one.

## Decision

- The rule is a `recurrence` attribute on `check_item`, stored in its canonical
  [Obsidian Tasks](https://publish.obsidian.md/tasks/) spelling: `every day`,
  `every weekday`, or `every [N] day|week|month|year[s]`. Rules Skriuw cannot
  compute stay literal text rather than being half-understood.
- Markdown writes it as the recurrence signifier before the due date, which
  stays last: `- [ ] Water plants <!--skriuw-task:t:b--> 🔁 every week 📅 2026-10-01`.
  The parser reads marker, rule and date in any order and in any letter case.
- Completing a repeating item keeps it checked and inserts the next occurrence
  directly below it, unchecked, due on the next date counted from its own due
  date, or from today when it had none. Months and years keep the day of the
  month, clamped to the end of shorter months. Unchecking never removes or adds
  an occurrence.
- A linked task's next occurrence gets a fresh task and block identity, so the
  completed record keeps its history and the new item is a task of its own. In
  the editor the toggle and the insertion are one transaction, and the next save
  promotes the new item. In the tasks view the paired `update_task` writes both
  items and a `create_task` in the same batch creates the next record, after the
  document that proves its link.
- In the editor, typing `every:<rule>` and a space on a checklist line sets the
  rule; its chip turns back into that token on Enter or click and stops the
  repeat on Delete.

## Consequences

- No schema or contract change: the rule is document content, and the task
  record does not store it.
- The mobile tasks surface ticks the checkbox through a Markdown line rewrite
  and does not insert the next occurrence; it keeps the rule intact, so the next
  occurrence appears when the task is completed on desktop or in the browser.
- Obsidian Tasks' richer rules (`every week on Sunday`, `when done`) are not
  computed.
