import type { WorkspaceSession } from "../../bridge/commit";
import { appendToJournalEntry, createJournalEntry, JournalAppendError } from "../journal/actions";
import { isDateKey, todayKey, type DateKey } from "../journal/dates";
import { journalNoteIdForDate } from "../journal/model";
import { newNodeId } from "../../shell/identity";
import { captureLines, type CaptureRecord } from "./capture-record";
import type { CaptureInbox } from "./inbox";

export type CaptureDrainResult = {
  /** Records whose text is now in an entry and which have left the queue. */
  written: number;
  /** Days that gained words, newest first, for the toast and for the tests. */
  days: DateKey[];
  /** Records still queued because the workspace refused the write. */
  deferred: number;
  /** Records discarded because no entry could ever accept them. */
  discarded: number;
};

function nothingDrained(): CaptureDrainResult {
  return { written: 0, days: [], deferred: 0, discarded: 0 };
}

/** The day a queued record belongs to; an unreadable one lands on today. */
function dayOf(record: CaptureRecord, today: DateKey): DateKey {
  return isDateKey(record.dateKey) ? record.dateKey : today;
}

function groupByDay(
  records: readonly CaptureRecord[],
  today: DateKey,
): Map<DateKey, CaptureRecord[]> {
  const byDay = new Map<DateKey, CaptureRecord[]>();
  for (const record of records) {
    const day = dayOf(record, today);
    const existing = byDay.get(day);
    if (existing) {
      existing.push(record);
    } else {
      byDay.set(day, [record]);
    }
  }
  return byDay;
}

/**
 * A record that can never succeed is a bug in the producer, not a workspace
 * failure: keeping it would block every later capture behind it, so it leaves
 * the queue and is counted.
 */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof JournalAppendError &&
    (error.reason === "nothing-to-append" || error.reason === "unreadable-document")
  );
}

/**
 * Writes every queued capture into its day's journal entry through ordinary
 * workspace operations, then settles exactly the records the workspace
 * acknowledged. A day whose write is rejected keeps its records, so the next
 * launch or the next foreground tries again and nothing is lost
 * (`docs/specs/mobile-app.md`, R-F8).
 */
export async function drainCaptureInbox(
  session: WorkspaceSession,
  inbox: CaptureInbox,
  today: DateKey = todayKey(),
): Promise<CaptureDrainResult> {
  const queued = inbox.readAll();
  if (queued.length === 0) {
    return nothingDrained();
  }
  const settled: string[] = [];
  const days: DateKey[] = [];
  let written = 0;
  let deferred = 0;
  let discarded = 0;

  for (const [day, records] of groupByDay(queued, today)) {
    const contributing = records.filter((record) => captureLines(record).length > 0);
    const empty = records.length - contributing.length;
    const lines = contributing.flatMap(captureLines);
    if (lines.length === 0) {
      settled.push(...records.map((record) => record.id));
      discarded += empty;
      continue;
    }
    const existing = journalNoteIdForDate(session.store.getState(), day);
    const noteId = existing ?? newNodeId();
    try {
      if (existing === null) {
        await createJournalEntry(session, noteId, day);
      }
      await appendToJournalEntry(session, noteId, lines);
      settled.push(...records.map((record) => record.id));
      written += contributing.length;
      discarded += empty;
      days.push(day);
    } catch (error) {
      session.reportFailure(error);
      if (isPermanent(error)) {
        settled.push(...records.map((record) => record.id));
        discarded += records.length;
      } else {
        deferred += records.length;
      }
    }
  }

  inbox.settle(settled);
  days.sort((left, right) => right.localeCompare(left));
  return { written, days, deferred, discarded };
}
