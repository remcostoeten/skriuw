# Database view projection

Date: 2026-10-18

## Objective

Measure the renderer work a database view adds per cell edit and on opening,
against the 8 ms P95 interaction target in the
[performance contract](../performance-contract.md). See
[ADR-0057](../adr/0057-database-views.md) for the design.

## Method

A Vitest run in Node 22 on a shared 4-core cloud container, not reference
hardware, over a generated workspace: 50 folders and 1,000 or 5,000 notes, each
note carrying a Status select (three options), a Priority number, and a text
property. The view is the all-notes scope with subfolders, one filter (Status
is Doing), and one sort (Priority descending), which exercises every stage.
Each figure is the median and P95 of 20 runs after one warm-up run.

- **Open**: project rows, discover columns, then filter and sort.
- **Cell edit**: plan the write, apply it to the store, reproject rows, check
  the column schema (unchanged, so discovery is skipped), then filter and sort.

The harness was a throwaway test and is not committed.

## Results

| Notes | Open, median | Open, P95 | Cell edit, median | Cell edit, P95 |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.2 ms | 5.3 ms | 1.3 ms | 2.0 ms |
| 5,000 | 6.6 ms | 12.2 ms | 6.3 ms | 10.0 ms |

Before two optimizations in this change, a 5,000-note cell edit took 16.2 ms
median. Caching the folding of property names and option labels cut column
discovery from 6.8 ms to 2.3 ms, and skipping discovery when only values
changed removed it from the edit path.

## Findings

- Folder-sized scopes are well inside the budget.
- The all-notes scope at 5,000 notes with a filter and a sort sits near the
  8 ms target at the median and over it at P95 on this machine. The remaining
  cost is reprojecting rows (about 2.7 ms) and sorting (about 2.8 ms).
- Rendering is bounded separately: the table renders at most 120 rows and a
  board 50 cards per group.

## Follow-up

Row projection and arrangement are now incremental for property-only changes
(2026-10-21). While the tree is untouched, the row selector rebuilds only the
rows whose own inputs changed, and `rearrangeDatabase` refilters and
reinserts only those rows into the sorted and grouped result.

Same generated workspace at 5,000 notes with 50 folders, the all-notes scope,
one filter and one sort, measured as the renderer work after one cell edit
(project rows, then arrange; column discovery is already skipped), median and
P95 of 35 edits on the same container:

| | Median | P95 |
| --- | ---: | ---: |
| Full reproject and arrange | 4.2 ms | 6.0 ms |
| Incremental | 0.5 ms | 0.8 ms |

A change that touches the tree, the columns, the view, the search or more than
32 rows still takes the full path.
