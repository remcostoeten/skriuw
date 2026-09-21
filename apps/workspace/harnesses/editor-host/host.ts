import {
  EDITOR_PROTOCOL_VERSION,
  type EditorDocument,
  type EditorToHostMessage,
  type HostToEditorMessage,
} from "../../../../mobile/src/editor/protocol.ts";

/**
 * A stand-in for the native host: it owns the notes, speaks only the editor
 * protocol to the iframe, and makes every `change` durable in memory before
 * acknowledging it with the next revision. `window.__EDITOR_HOST__` is the
 * automation boundary the browser test drives.
 */

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type HostMessageBody = DistributiveOmit<HostToEditorMessage, "v">;
type HostNote = EditorDocument & { title: string };
type AckMode = "accept" | "conflict";

type SaveOperation = {
  type: "save_document";
  noteId: string;
  documentJson: unknown;
  markdown: string;
  wordCount: number;
  expectedRevision: number;
};

const NOTE_COUNT = 8;
const notes = new Map<string, HostNote>();
const messages: EditorToHostMessage[] = [];
let ackMode: AckMode = "accept";
let theme = "midnight";

function seedNote(index: number): HostNote {
  const title = `Note ${index}`;
  const body = `Body of note ${index}.`;
  return {
    noteId: `note-${index}`,
    title,
    document: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
        { type: "paragraph", content: [{ type: "text", text: body }] },
      ],
    },
    markdown: `# ${title}\n\n${body}\n`,
    wordCount: 7,
    revision: 1,
  };
}

function editorWindow(): Window {
  const frame = document.querySelector<HTMLIFrameElement>("#editor");
  if (!frame?.contentWindow) throw new Error("The editor frame is missing.");
  return frame.contentWindow;
}

function send(message: HostMessageBody): void {
  editorWindow().postMessage({ ...message, v: EDITOR_PROTOCOL_VERSION }, window.location.origin);
}

function sendRaw(message: unknown): void {
  editorWindow().postMessage(message, window.location.origin);
}

function load(noteId: string): void {
  const note = notes.get(noteId);
  if (!note) throw new Error(`The harness has no note ${noteId}.`);
  send({ type: "load", ...note, theme });
}

function saveOperation(operations: readonly unknown[]): SaveOperation | null {
  for (const envelope of operations) {
    const operation = (envelope as { operation?: { type?: string } }).operation;
    if (operation?.type === "save_document") return operation as SaveOperation;
  }
  return null;
}

function acknowledge(message: Extract<EditorToHostMessage, { type: "change" }>): void {
  const save = saveOperation(message.operations);
  const note = save ? notes.get(save.noteId) : undefined;
  if (save && note && (ackMode === "conflict" || save.expectedRevision !== note.revision)) {
    send({
      type: "ack",
      changeId: message.changeId,
      ok: false,
      error: `revision conflict: expected ${save.expectedRevision}, found ${note.revision}`,
    });
    return;
  }
  const revisions = [];
  if (save && note) {
    const revision = note.revision + 1;
    notes.set(save.noteId, {
      ...note,
      document: save.documentJson,
      markdown: save.markdown,
      wordCount: save.wordCount,
      revision,
    });
    revisions.push({ id: save.noteId, revision });
  }
  send({
    type: "ack",
    changeId: message.changeId,
    ok: true,
    ack: { applied: message.operations.length, revisions, rankChanges: [] },
  });
}

function receive(event: MessageEvent): void {
  if (event.source !== editorWindow() || event.origin !== window.location.origin) return;
  const message = event.data as EditorToHostMessage;
  messages.push(message);
  if (message.type === "change") acknowledge(message);
  if (message.type === "request") {
    send({
      type: "response",
      requestId: message.requestId,
      ok: false,
      error: `${message.command} is not served by the browser harness.`,
    });
  }
}

for (let index = 1; index <= NOTE_COUNT; index += 1) {
  const note = seedNote(index);
  notes.set(note.noteId, note);
}

window.addEventListener("message", receive);

const automation = {
  messages,
  load,
  send,
  sendRaw,
  note: (noteId: string) => notes.get(noteId) ?? null,
  noteIds: () => [...notes.keys()],
  setAckMode: (mode: AckMode) => {
    ackMode = mode;
  },
  setTheme: (name: string) => {
    theme = name;
    send({ type: "theme", name });
  },
  publishReferences: () => {
    send({
      type: "references",
      notes: [...notes.values()].map(({ noteId, title }) => ({ id: noteId, title })),
      tags: [{ id: "tag-harness", name: "harness", color: null }],
      people: [{ id: "person-ada", name: "Ada Lovelace", initials: "AL", color: null }],
    });
  },
};

(window as unknown as { __EDITOR_HOST__: typeof automation }).__EDITOR_HOST__ = automation;
