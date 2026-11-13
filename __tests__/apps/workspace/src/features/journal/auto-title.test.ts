import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  NoteProperty,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import type { AiCompletionEvent, AiCompletionRequest } from "@/contracts/ai";
import {
  JOURNAL_AUTO_TITLE_ORIGIN,
  JOURNAL_AUTO_TITLE_SETTING,
  nextAutoTitleEntry,
  titleFromReply,
} from "@/features/journal/auto-title";
import { startJournalAutoTitles } from "@/features/journal/auto-title-runner";
import { JOURNAL_DATE_PROPERTY_ID, JOURNAL_ROOT_ID } from "@skriuw/renderer-core/journal/constants";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";

setupTauriInvokeStub();

const TODAY = "2026-07-20";
const MODEL = { providerId: "ollama", modelId: "tiny" };

function entryNode(id: string, title: string, lockedAt: number | null = null): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: JOURNAL_ROOT_ID,
    rank: 100,
    title,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    lockedAt,
  };
}

function dateProperty(noteId: string, dateKey: string): NoteProperty {
  return {
    noteId,
    id: JOURNAL_DATE_PROPERTY_ID,
    name: "Date",
    value: { valueVersion: 1, type: "date", value: dateKey },
    options: [],
    position: 0,
  };
}

function entryDocument(noteId: string, wordCount: number) {
  return {
    noteId,
    documentJson: { type: "doc" },
    markdown: `words of ${noteId}`,
    revision: 1,
    wordCount,
  };
}

function snapshot(settings: Record<string, unknown> = {}): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: [
      {
        ...entryNode(JOURNAL_ROOT_ID, "Journal"),
        kind: "folder",
        parentId: null,
      },
      entryNode("today", "Untitled"),
      entryNode("recent", "Untitled"),
      entryNode("named", "A walk by the canal"),
      entryNode("short", "Untitled"),
      entryNode("locked", "Untitled", 5),
      entryNode("older", "Untitled"),
    ],
    documents: [
      entryDocument("today", 200),
      entryDocument("recent", 120),
      entryDocument("named", 90),
      entryDocument("short", 4),
      entryDocument("locked", 300),
      entryDocument("older", 60),
    ],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "",
      ...settings,
    },
    tags: [],
    people: [],
    references: [],
    properties: [
      dateProperty("today", TODAY),
      dateProperty("recent", "2026-07-19"),
      dateProperty("named", "2026-07-18"),
      dateProperty("short", "2026-07-17"),
      dateProperty("locked", "2026-07-16"),
      dateProperty("older", "2026-07-12"),
    ],
  };
}

type FakeProvider = {
  requests: AiCompletionRequest[];
  origins: string[];
  start: (
    request: AiCompletionRequest,
    origin: string,
    onEvent: (event: AiCompletionEvent) => void,
  ) => Promise<{ cancel: () => Promise<boolean>; dispose: () => void }>;
};

function fakeProvider(answer: (request: AiCompletionRequest) => AiCompletionEvent[]): FakeProvider {
  const provider: FakeProvider = {
    requests: [],
    origins: [],
    start(request, origin, onEvent) {
      provider.requests.push(request);
      provider.origins.push(origin);
      queueMicrotask(() => {
        for (const event of answer(request)) {
          onEvent(event);
        }
      });
      return Promise.resolve({ cancel: () => Promise.resolve(true), dispose: () => {} });
    },
  };
  return provider;
}

function titled(title: string) {
  return (request: AiCompletionRequest): AiCompletionEvent[] => [
    { type: "delta", requestId: request.requestId, sequence: 0, text: title },
    { type: "done", requestId: request.requestId },
  ];
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

test("nextAutoTitleEntry walks untitled past entries newest first", () => {
  const state = createInitialState(snapshot());
  const attempted = new Set<string>();
  const order: string[] = [];
  for (;;) {
    const entry = nextAutoTitleEntry(state, TODAY, attempted);
    if (entry === null) {
      break;
    }
    order.push(entry.noteId);
    attempted.add(entry.noteId);
  }
  assert.deepEqual(order, ["recent", "older"]);
  assert.equal(
    nextAutoTitleEntry(state, "2026-08-01", new Set(["recent", "older"]))?.noteId,
    "today",
  );
});

test("titleFromReply keeps the first line and drops wrapping", () => {
  assert.equal(titleFromReply('"A slow Sunday."\n\nHope that helps'), "A slow Sunday");
  assert.equal(titleFromReply("\n## **Moving day**\n"), "Moving day");
  assert.equal(titleFromReply("  \n "), null);
  assert.equal(titleFromReply("Untitled"), null);
  assert.equal(titleFromReply("word ".repeat(40))?.length, 80);
});

test("the runner stays idle while the setting is off", async () => {
  const store = createRendererStore(createInitialState(snapshot({ aiModel: MODEL })));
  const provider = fakeProvider(titled("Never asked"));
  const stop = startJournalAutoTitles(store, new AbortController().signal, {
    startCompletion: provider.start,
    today: () => TODAY,
    settleDelayMs: 0,
  });
  await settled();
  stop();
  assert.equal(provider.requests.length, 0);
});

test("the runner titles every eligible entry and leaves the rest alone", async () => {
  const store = createRendererStore(
    createInitialState(snapshot({ aiModel: MODEL, [JOURNAL_AUTO_TITLE_SETTING]: true })),
  );
  const provider = fakeProvider((request) =>
    titled(`About ${request.userPrompt.replace("words of ", "")}`)(request),
  );
  const stop = startJournalAutoTitles(store, new AbortController().signal, {
    startCompletion: provider.start,
    today: () => TODAY,
    settleDelayMs: 0,
  });
  await settled();
  stop();
  const titles = store.getState().nodes;
  assert.deepEqual(provider.origins, [JOURNAL_AUTO_TITLE_ORIGIN, JOURNAL_AUTO_TITLE_ORIGIN]);
  assert.equal(provider.requests[0]?.modelId, "tiny");
  assert.equal(titles.get("recent")?.title, "About recent");
  assert.equal(titles.get("older")?.title, "About older");
  assert.equal(titles.get("today")?.title, "Untitled");
  assert.equal(titles.get("short")?.title, "Untitled");
  assert.equal(titles.get("locked")?.title, "Untitled");
  assert.equal(titles.get("named")?.title, "A walk by the canal");
});

test("a failed request pauses the runner and reports why", async () => {
  const store = createRendererStore(
    createInitialState(snapshot({ aiModel: MODEL, [JOURNAL_AUTO_TITLE_SETTING]: true })),
  );
  const provider = fakeProvider((request) => [
    {
      type: "provider_error",
      requestId: request.requestId,
      error: {
        providerId: "ollama",
        category: "unavailable_provider",
        message: "Ollama is not running.",
        recoveryAction: "check_provider_status",
      },
    },
  ]);
  const failures: string[] = [];
  const stop = startJournalAutoTitles(store, new AbortController().signal, {
    startCompletion: provider.start,
    today: () => TODAY,
    reportFailure: (message) => failures.push(message),
    settleDelayMs: 0,
  });
  await settled();
  stop();
  assert.equal(provider.requests.length, 1);
  assert.deepEqual(failures, ["Ollama is not running."]);
  assert.equal(store.getState().nodes.get("recent")?.title, "Untitled");
});
