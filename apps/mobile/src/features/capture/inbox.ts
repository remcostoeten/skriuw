import { decodeCaptureRecords, encodeCaptureRecord, type CaptureRecord } from "./capture-record";

/**
 * The durable queue between a capture and the workspace. A record is on the
 * device's storage before the application is involved at all, and it leaves
 * only once the workspace has acknowledged the write, so a capture made while
 * the workspace is locked, closed or still opening is never dropped
 * (`apps/docs/content/v2/specs/mobile-app.md`, R-F8).
 */
export type CaptureInbox = {
  append: (record: CaptureRecord) => void;
  readAll: () => CaptureRecord[];
  /** Drops exactly the acknowledged records, keeping anything appended meanwhile. */
  settle: (ids: readonly string[]) => void;
};

/**
 * The append-only text file both native share targets write to, read here.
 * `readWhole` and `replaceWhole` are the only device calls, so the same model
 * runs over a real file, an App Group container, or a string in a test.
 */
export type InboxFile = {
  readWhole: () => string;
  appendLine: (line: string) => void;
  replaceWhole: (contents: string) => void;
};

export function createCaptureInbox(file: InboxFile): CaptureInbox {
  return {
    append(record) {
      file.appendLine(encodeCaptureRecord(record));
    },
    readAll() {
      return decodeCaptureRecords(file.readWhole());
    },
    settle(ids) {
      if (ids.length === 0) {
        return;
      }
      const settled = new Set(ids);
      const kept = decodeCaptureRecords(file.readWhole()).filter(
        (record) => !settled.has(record.id),
      );
      file.replaceWhole(kept.map(encodeCaptureRecord).join(""));
    },
  };
}

export function createMemoryInboxFile(initial = ""): InboxFile {
  let contents = initial;
  return {
    readWhole: () => contents,
    appendLine: (line) => {
      contents += line;
    },
    replaceWhole: (next) => {
      contents = next;
    },
  };
}
