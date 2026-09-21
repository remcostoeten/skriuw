/**
 * The wire shape of a queued capture. It is written by three producers — the
 * Android share activity, the iOS share extension, and quick capture inside
 * the app — and read by one consumer, so the encoding is deliberately dull:
 * one JSON object per line, appended, never rewritten in place.
 */

export type CaptureSource = "quick" | "share";

export type CaptureRecord = {
  id: string;
  text: string;
  /** What the sending application called the selection, when it named one. */
  title: string | null;
  /** The day the capture belongs to, so a queue drained tomorrow keeps its day. */
  dateKey: string;
  source: CaptureSource;
  capturedAt: number;
};

function isCaptureSource(value: unknown): value is CaptureSource {
  return value === "quick" || value === "share";
}

function readRecord(value: unknown): CaptureRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const { id, text, title, dateKey, source, capturedAt } = candidate;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  if (typeof text !== "string" || typeof dateKey !== "string") {
    return null;
  }
  if (!isCaptureSource(source) || typeof capturedAt !== "number") {
    return null;
  }
  return {
    id,
    text,
    title: typeof title === "string" ? title : null,
    dateKey,
    source,
    capturedAt,
  };
}

export function encodeCaptureRecord(record: CaptureRecord): string {
  return `${JSON.stringify(record)}\n`;
}

/**
 * Every readable record in an inbox file. A line the writer never finished —
 * a share extension killed mid-append is the realistic case — is skipped
 * rather than taking the rest of the queue down with it.
 */
export function decodeCaptureRecords(contents: string): CaptureRecord[] {
  const records: CaptureRecord[] = [];
  for (const line of contents.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = readRecord(parsed);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

/** The lines a capture contributes to its entry: the sender's title, then the text. */
export function captureLines(record: CaptureRecord): string[] {
  const body = record.text.trim();
  const title = record.title?.trim() ?? "";
  if (title.length === 0 || title === body) {
    return body.length === 0 ? [] : [body];
  }
  return body.length === 0 ? [title] : [title, body];
}
