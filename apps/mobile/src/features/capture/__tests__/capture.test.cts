import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import { JOURNAL_ROOT_ID } from "@skriuw/renderer-core/journal/constants";
import { createNote } from "../../../shell/tree-actions";
import { openWorkspaceSession, type ShellSession } from "../../../shell/workspace-session";
import { journalNoteIdForDate, selectJournalEntries } from "../../journal/model";
import { captureLines, decodeCaptureRecords, type CaptureRecord } from "../capture-record";
import { drainCaptureInbox } from "../drain";
import { createCaptureInbox, createMemoryInboxFile, type InboxFile } from "../inbox";

const TODAY = "2026-09-20";

/**
 * A line exactly as `share-extension/android/ShareCaptureActivity.kt` writes
 * it, so the two halves of the contract are checked against each other rather
 * than against a convenient object.
 */
function sharedLine(id: string, text: string, title: string | null, dateKey = TODAY): string {
  function quoted(value: string) {
    return JSON.stringify(value);
  }
  return `{"id":"${id}","text":${quoted(text)},"title":${
    title === null ? "null" : quoted(title)
  },"dateKey":"${dateKey}","source":"share","capturedAt":1789000000000}\n`;
}

function quickRecord(id: string, text: string, dateKey = TODAY): CaptureRecord {
  return { id, text, title: null, dateKey, source: "quick", capturedAt: 1789000000000 };
}

async function openSession(bridge: BridgePort): Promise<ShellSession> {
  return openWorkspaceSession(bridge, (error) => {
    throw error;
  });
}

function entryMarkdown(session: ShellSession, dateKey: string): string {
  const noteId = journalNoteIdForDate(session.store.getState(), dateKey);
  return noteId === null ? "" : (session.store.getState().documents.get(noteId)?.markdown ?? "");
}

test("text shared from another application appears in today's entry after launch", async () => {
  const bridge = createMemoryBridge();
  const file = createMemoryInboxFile(sharedLine("share-1", "Read this later", "A good article"));
  const inbox = createCaptureInbox(file);
  const session = await openSession(bridge);

  const result = await drainCaptureInbox(session, inbox, TODAY);

  assert.deepEqual(result, { written: 1, days: [TODAY], deferred: 0, discarded: 0 });
  assert.match(entryMarkdown(session, TODAY), /A good article\n\nRead this later/);
  assert.equal(inbox.readAll().length, 0);

  const state = session.store.getState();
  const noteId = journalNoteIdForDate(state, TODAY);
  assert.equal(state.nodes.get(noteId ?? "")?.parentId, JOURNAL_ROOT_ID);
  await session.close();
});

test("the entry survives the relaunch that reads it back", async () => {
  const bridge = createMemoryBridge();
  const inbox = createCaptureInbox(
    createMemoryInboxFile(sharedLine("share-1", "Read this later", null)),
  );
  const first = await openSession(bridge);
  await drainCaptureInbox(first, inbox, TODAY);
  await first.close();

  const relaunched = await openSession(bridge);

  assert.match(entryMarkdown(relaunched, TODAY), /Read this later/);
  assert.equal(selectJournalEntries(relaunched.store.getState()).length, 1);
  await relaunched.close();
});

test("a second capture appends to the entry the first one created", async () => {
  const bridge = createMemoryBridge();
  const file = createMemoryInboxFile(sharedLine("share-1", "First", null));
  const inbox = createCaptureInbox(file);
  const session = await openSession(bridge);

  await drainCaptureInbox(session, inbox, TODAY);
  inbox.append(quickRecord("quick-1", "Second"));
  await drainCaptureInbox(session, inbox, TODAY);

  assert.equal(entryMarkdown(session, TODAY), "First\n\nSecond\n");
  assert.equal(selectJournalEntries(session.store.getState()).length, 1);
  await session.close();
});

test("a capture the workspace refuses stays queued and lands on the next drain", async () => {
  const memory = createMemoryBridge();
  let refuse = true;
  const bridge: BridgePort = {
    ...memory,
    applyWorkspaceOperations: async (operations) => {
      if (refuse) {
        throw new Error("the workspace is closed");
      }
      return memory.applyWorkspaceOperations(operations);
    },
  };
  const failures: unknown[] = [];
  const session = await openWorkspaceSession(bridge, (error) => failures.push(error));
  const inbox = createCaptureInbox(
    createMemoryInboxFile(sharedLine("share-1", "Kept through the refusal", null)),
  );

  const refused = await drainCaptureInbox(session, inbox, TODAY);

  assert.deepEqual(refused, { written: 0, days: [], deferred: 1, discarded: 0 });
  assert.equal(inbox.readAll().length, 1);
  assert.ok(failures.length > 0);

  refuse = false;
  const accepted = await drainCaptureInbox(session, inbox, TODAY);

  assert.equal(accepted.written, 1);
  assert.equal(inbox.readAll().length, 0);
  assert.match(entryMarkdown(session, TODAY), /Kept through the refusal/);
  await session.close();
});

test("a queue drained on a later day still writes each capture to its own day", async () => {
  const bridge = createMemoryBridge();
  const inbox = createCaptureInbox(
    createMemoryInboxFile(
      sharedLine("share-1", "Monday thought", null, "2026-09-14") +
        sharedLine("share-2", "Sunday thought", null, "2026-09-13"),
    ),
  );
  const session = await openSession(bridge);

  const result = await drainCaptureInbox(session, inbox, TODAY);

  assert.deepEqual(result.days, ["2026-09-14", "2026-09-13"]);
  assert.match(entryMarkdown(session, "2026-09-14"), /Monday thought/);
  assert.match(entryMarkdown(session, "2026-09-13"), /Sunday thought/);
  assert.equal(entryMarkdown(session, TODAY), "");
  await session.close();
});

test("a capture never takes the note the workspace had open", async () => {
  const bridge = createMemoryBridge();
  const session = await openSession(bridge);
  const opened = await createNote(session, null);
  const inbox = createCaptureInbox(createMemoryInboxFile(sharedLine("share-1", "Aside", null)));

  await drainCaptureInbox(session, inbox, TODAY);

  assert.equal(session.store.getState().activeNoteId, opened);
  await session.close();
});

test("an unfinished line is skipped without taking the queue down with it", () => {
  const file: InboxFile = createMemoryInboxFile(
    `${sharedLine("share-1", "Kept", null)}{"id":"share-2","text":"half a rec`,
  );
  const inbox = createCaptureInbox(file);

  const records = inbox.readAll();

  assert.equal(records.length, 1);
  assert.equal(records[0]?.id, "share-1");
});

test("settling drops the acknowledged records and keeps the rest", () => {
  const inbox = createCaptureInbox(
    createMemoryInboxFile(
      sharedLine("share-1", "One", null) + sharedLine("share-2", "Two", null),
    ),
  );

  inbox.settle(["share-1"]);

  assert.deepEqual(
    inbox.readAll().map((record) => record.id),
    ["share-2"],
  );
});

test("a capture with nothing in it leaves the queue instead of blocking it", async () => {
  const bridge = createMemoryBridge();
  const inbox = createCaptureInbox(
    createMemoryInboxFile(sharedLine("share-1", "   ", null) + sharedLine("share-2", "Real", null)),
  );
  const session = await openSession(bridge);

  const result = await drainCaptureInbox(session, inbox, TODAY);

  assert.equal(result.written, 1);
  assert.equal(result.discarded, 1);
  assert.equal(inbox.readAll().length, 0);
  await session.close();
});

test("the sender's subject becomes the line above the text, unless it repeats it", () => {
  const [withTitle] = decodeCaptureRecords(sharedLine("share-1", "Body", "Title"));
  const [repeated] = decodeCaptureRecords(sharedLine("share-2", "Body", "Body"));

  assert.deepEqual(captureLines(withTitle!), ["Title", "Body"]);
  assert.deepEqual(captureLines(repeated!), ["Body"]);
});
