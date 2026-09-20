import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryBridge } from "../../../../../shared/renderer-core/src/bridge/memory-adapter";
import {
  WORKSPACE_PROTOCOL_VERSION,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
  type WorkspaceTask,
} from "../../../../../shared/renderer-core/src/contracts/workspace";
import type { BridgePort } from "../../../../../shared/renderer-core/src/bridge/port";
import type { RendererState } from "../../../../../shared/renderer-core/src/store/types";
import { openWorkspaceSession, type ShellSession } from "../../../shell/workspace-session";
import { alignChecklist, checklistItems } from "../checklist-document";
import { promoteChecklistItem, toggleTask, undoPromotion } from "../task-actions";
import {
  buildChecklistPromotion,
  buildPromotionUndo,
  buildTaskToggle,
} from "../task-operations";
import {
  projectPromotionSource,
  projectTasks,
  summarizeTasks,
  UNSOURCED_GROUP_LABEL,
} from "../tasks-model";

const NOTE_ID = "note-checklist";
const OTHER_NOTE_ID = "note-plain";
const AT = Date.UTC(2026, 8, 20);

const SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
};

type ItemSeed = {
  text: string;
  checked?: boolean;
  taskId?: string;
  blockId?: string;
};

function checkItem(seed: ItemSeed): unknown {
  return {
    type: "check_item",
    attrs: {
      checked: seed.checked === true,
      taskId: seed.taskId ?? null,
      blockId: seed.blockId ?? null,
    },
    content: [{ type: "paragraph", content: [{ type: "text", text: seed.text }] }],
  };
}

function checklistDocument(seeds: readonly ItemSeed[]): unknown {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Checklist note" }] },
      { type: "check_list", content: seeds.map(checkItem) },
    ],
  };
}

function checklistMarkdown(seeds: readonly ItemSeed[]): string {
  const lines = seeds.map((seed) => {
    const marker =
      seed.taskId === undefined ? "" : ` <!--skriuw-task:${seed.taskId}:${seed.blockId}-->`;
    return `- [${seed.checked === true ? "x" : " "}] ${seed.text}${marker}`;
  });
  return `# Checklist note\n\n${lines.join("\n")}\n`;
}

function node(id: string, title: string, rank: number): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title,
    icon: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    pinnedAt: null,
  };
}

function snapshot(seeds: readonly ItemSeed[], tasks: WorkspaceTask[] = []): WorkspaceSnapshot {
  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: NOTE_ID,
    nodes: [node(NOTE_ID, "Checklist note", 1024), node(OTHER_NOTE_ID, "Plain note", 2048)],
    documents: [
      {
        noteId: NOTE_ID,
        documentJson: checklistDocument(seeds),
        markdown: checklistMarkdown(seeds),
        revision: 1,
        wordCount: 12,
      },
      {
        noteId: OTHER_NOTE_ID,
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: "# Plain note\n",
        revision: 1,
        wordCount: 2,
      },
    ],
    historyHeaders: [],
    settings: SETTINGS,
    tags: [],
    people: [],
    references: [],
    tasks,
  };
}

function linkedTask(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: "task-1",
    title: "Ship the tasks view",
    status: "todo",
    priority: "medium",
    dueDate: null,
    description: "",
    tagIds: [],
    assigneeIds: [],
    source: { noteId: NOTE_ID, blockId: "block-1" },
    detachedAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

async function openSession(bridge: BridgePort): Promise<ShellSession> {
  return openWorkspaceSession(bridge, (error) => {
    throw error;
  });
}

async function withSession(
  bridge: BridgePort,
  run: (session: ShellSession) => Promise<void>,
): Promise<void> {
  const session = await openSession(bridge);
  try {
    await run(session);
  } finally {
    await session.close();
  }
}

function documentOf(state: RendererState, noteId: string = NOTE_ID) {
  const record = state.documents.get(noteId);
  assert.ok(record, `document ${noteId} is loaded`);
  return record;
}

function checklistLine(markdown: string, text: string): string {
  const line = markdown.split("\n").find((candidate) => candidate.includes(text));
  assert.ok(line, `markdown carries a line for ${text}`);
  return line;
}

test("checklist items are read in document order with their link", () => {
  const items = checklistItems(
    checklistDocument([
      { text: "First" },
      { text: "Second", checked: true, taskId: "task-1", blockId: "block-1" },
    ]),
  );
  assert.deepEqual(
    items.map((item) => [item.index, item.title, item.checked, item.taskId]),
    [
      [0, "First", false, null],
      [1, "Second", true, "task-1"],
    ],
  );
});

test("alignment pairs items with their markdown lines", () => {
  const seeds: ItemSeed[] = [
    { text: "First" },
    { text: "Second", checked: true, taskId: "task-1", blockId: "block-1" },
  ];
  const alignment = alignChecklist(checklistDocument(seeds), checklistMarkdown(seeds));
  assert.ok(alignment);
  assert.deepEqual([...alignment.lineNumbers], [2, 3]);
});

test("alignment refuses markdown that does not spell the same checklist", () => {
  const seeds: ItemSeed[] = [{ text: "First" }, { text: "Second" }];
  const document = checklistDocument(seeds);
  assert.equal(alignChecklist(document, "# Checklist note\n\n- [ ] First\n"), null);
  assert.equal(
    alignChecklist(document, "# Checklist note\n\n- [x] First\n- [ ] Second\n"),
    null,
    "a tick that disagrees is not alignment",
  );
  assert.equal(
    alignChecklist(
      document,
      "# Checklist note\n\n- [ ] First <!--skriuw-task:task-1:block-1-->\n- [ ] Second\n",
    ),
    null,
    "a marker the document does not carry is not alignment",
  );
});

test("alignment ignores checklist lines inside fenced code", () => {
  const seeds: ItemSeed[] = [{ text: "First" }];
  const markdown = `# Checklist note\n\n\`\`\`markdown\n- [ ] not a task\n\`\`\`\n\n- [ ] First\n`;
  const alignment = alignChecklist(checklistDocument(seeds), markdown);
  assert.ok(alignment);
  assert.deepEqual([...alignment.lineNumbers], [6]);
});

test("a raw markdown note is refused rather than rewritten", () => {
  const document = {
    type: "doc",
    content: [{ type: "raw_markdown", content: [{ type: "text", text: "- [ ] First" }] }],
  };
  assert.equal(alignChecklist(document, "- [ ] First\n"), null);
});

test("promotion writes the document and the record as one operation", async () => {
  const bridge = createMemoryBridge({ snapshot: snapshot([{ text: "Ship the tasks view" }]) });
  await withSession(bridge, async (session) => {
    const result = buildChecklistPromotion(session.store.getState(), {
      noteId: NOTE_ID,
      itemIndex: 0,
      taskId: "task-1",
      blockId: "block-1",
      at: AT,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.operations.length, 1);
    const operation = result.operations[0];
    assert.equal(operation?.type, "promote_checklist_task");
    assert.equal(operation.task.source?.blockId, "block-1");
    assert.equal(operation.task.status, "todo");
    assert.equal(operation.document.expectedRevision, 1);
    assert.match(operation.document.markdown, /- \[ \] Ship the tasks view <!--skriuw-task:task-1:block-1-->/);
  });
});

test("promotion refuses an item that is already a task, empty, or missing", async () => {
  const bridge = createMemoryBridge({
    snapshot: snapshot([
      { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
      { text: "" },
    ]),
  });
  await withSession(bridge, async (session) => {
    const state = session.store.getState();
    const input = { noteId: NOTE_ID, taskId: "task-2", blockId: "block-2", at: AT };
    assert.equal(
      (buildChecklistPromotion(state, { ...input, itemIndex: 0 }) as { reason?: string }).reason,
      "already-linked",
    );
    assert.equal(
      (buildChecklistPromotion(state, { ...input, itemIndex: 1 }) as { reason?: string }).reason,
      "empty-title",
    );
    assert.equal(
      (buildChecklistPromotion(state, { ...input, itemIndex: 9 }) as { reason?: string }).reason,
      "block-missing",
    );
    assert.equal(
      (
        buildChecklistPromotion(state, {
          ...input,
          itemIndex: 1,
          blockId: "task-2",
        }) as { reason?: string }
      ).reason,
      "invalid-identity",
      "a task cannot share its identity with its own block",
    );
  });
});

test("toggling a linked task rewrites the record and its checklist item", async () => {
  const seeds: ItemSeed[] = [
    { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
  ];
  const bridge = createMemoryBridge({ snapshot: snapshot(seeds, [linkedTask()]) });
  await withSession(bridge, async (session) => {
    const result = buildTaskToggle(session.store.getState(), "task-1", AT + 1);
    assert.equal(result.status, "ready");
    const operation = result.operations[0];
    assert.equal(operation?.type, "update_task");
    assert.equal(operation.task.status, "done");
    assert.equal(operation.task.source?.blockId, "block-1", "toggling never moves the link");
    assert.match(
      operation.document?.markdown ?? "",
      /- \[x\] Ship the tasks view <!--skriuw-task:task-1:block-1-->/,
    );
    assert.equal(
      checklistItems(operation.document?.documentJson).every((item) => item.checked),
      true,
    );
  });
});

test("a detached task toggles without a document", async () => {
  const detached = linkedTask({ source: null, detachedAt: AT });
  const bridge = createMemoryBridge({ snapshot: snapshot([{ text: "Other" }], [detached]) });
  await withSession(bridge, async (session) => {
    const result = buildTaskToggle(session.store.getState(), "task-1", AT + 1);
    assert.equal(result.status, "ready");
    const operation = result.operations[0];
    assert.equal(operation?.type, "update_task");
    assert.equal(operation.document, null);
  });
});

test("a duplicated link is reported rather than picked", async () => {
  const seeds: ItemSeed[] = [
    { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
    { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
  ];
  const bridge = createMemoryBridge({ snapshot: snapshot(seeds, [linkedTask()]) });
  await withSession(bridge, async (session) => {
    const result = buildTaskToggle(session.store.getState(), "task-1", AT + 1);
    assert.equal((result as { reason?: string }).reason, "block-ambiguous");
  });
});

test("a task whose item left the document is reported, not guessed at", async () => {
  const bridge = createMemoryBridge({
    snapshot: snapshot([{ text: "Something else" }], [linkedTask()]),
  });
  await withSession(bridge, async (session) => {
    const result = buildTaskToggle(session.store.getState(), "task-1", AT + 1);
    assert.equal((result as { reason?: string }).reason, "block-missing");
  });
});

test("undoing a promotion deletes the record and unlinks the item", async () => {
  const seeds: ItemSeed[] = [
    { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
  ];
  const bridge = createMemoryBridge({ snapshot: snapshot(seeds, [linkedTask()]) });
  await withSession(bridge, async (session) => {
    const result = buildPromotionUndo(session.store.getState(), "task-1", AT + 1);
    assert.equal(result.status, "ready");
    const operation = result.operations[0];
    assert.equal(operation?.type, "delete_task");
    assert.doesNotMatch(operation.document?.markdown ?? "", /skriuw-task/);
    assert.equal(checklistItems(operation.document?.documentJson)[0]?.taskId, null);
  });
});

test("tasks are grouped under their source note, detached work last", async () => {
  const tasks = [
    linkedTask(),
    linkedTask({ id: "task-2", title: "Quick capture", source: null, detachedAt: AT }),
  ];
  const seeds: ItemSeed[] = [
    { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
  ];
  const bridge = createMemoryBridge({ snapshot: snapshot(seeds, tasks) });
  await withSession(bridge, async (session) => {
    const groups = projectTasks(session.store.getState());
    assert.deepEqual(
      groups.map((group) => [group.noteTitle, group.rows.length]),
      [
        ["Checklist note", 1],
        [UNSOURCED_GROUP_LABEL, 1],
      ],
    );
    assert.equal(groups[1]?.rows[0]?.detached, true);
    assert.deepEqual(summarizeTasks(session.store.getState()), { total: 2, open: 2 });
  });
});

test("the open note offers only its unlinked, titled checklist items", async () => {
  const seeds: ItemSeed[] = [
    { text: "Ship the tasks view", taskId: "task-1", blockId: "block-1" },
    { text: "Write the tests" },
    { text: "" },
  ];
  const bridge = createMemoryBridge({ snapshot: snapshot(seeds, [linkedTask()]) });
  await withSession(bridge, async (session) => {
    const source = projectPromotionSource(session.store.getState());
    assert.equal(source?.noteId, NOTE_ID);
    assert.deepEqual(source?.candidates, [
      { itemIndex: 1, title: "Write the tests", checked: false },
    ]);
    session.store.setActiveNote(OTHER_NOTE_ID);
    assert.equal(projectPromotionSource(session.store.getState()), null);
  });
});

test("promote, complete and undo survive reopening the workspace", async () => {
  const bridge = createMemoryBridge({
    snapshot: snapshot([{ text: "Ship the tasks view" }, { text: "Write the tests" }]),
  });

  let taskId = "";
  let blockId = "";
  await withSession(bridge, async (session) => {
    const promoted = await promoteChecklistItem(session, NOTE_ID, 1);
    assert.equal(promoted.status, "committed");
    taskId = promoted.taskId;
    const task = session.store.getState().tasks.get(taskId);
    blockId = task?.source?.blockId ?? "";
    assert.equal(task?.title, "Write the tests");
    assert.equal(task?.status, "todo");
    assert.equal(
      projectPromotionSource(session.store.getState())?.candidates.length,
      1,
      "a promoted item is no longer on offer",
    );
  });

  await withSession(bridge, async (session) => {
    const state = session.store.getState();
    assert.equal(state.tasks.get(taskId)?.status, "todo");
    assert.equal(
      checklistLine(documentOf(state).markdown, "Write the tests"),
      `- [ ] Write the tests <!--skriuw-task:${taskId}:${blockId}-->`,
    );

    const completed = await toggleTask(session, taskId);
    assert.equal(completed.status, "committed");
    assert.equal(completed.done, true);
  });

  await withSession(bridge, async (session) => {
    const state = session.store.getState();
    assert.equal(state.tasks.get(taskId)?.status, "done");
    assert.equal(
      checklistLine(documentOf(state).markdown, "Write the tests"),
      `- [x] Write the tests <!--skriuw-task:${taskId}:${blockId}-->`,
      "the note body carries the completion the surface shows",
    );
    assert.equal(
      checklistItems(documentOf(state).documentJson)[1]?.checked,
      true,
      "and so does the document the editor will load",
    );

    const reopened = await toggleTask(session, taskId);
    assert.equal(reopened.status, "committed");
  });

  await withSession(bridge, async (session) => {
    const state = session.store.getState();
    assert.equal(state.tasks.get(taskId)?.status, "todo");
    assert.equal(
      checklistLine(documentOf(state).markdown, "Write the tests"),
      `- [ ] Write the tests <!--skriuw-task:${taskId}:${blockId}-->`,
    );
    assert.equal(checklistItems(documentOf(state).documentJson)[1]?.checked, false);
    assert.equal(checklistItems(documentOf(state).documentJson)[0]?.taskId, null, "the item beside it was never touched");
  });
});

test("undoing a promotion survives reopening the workspace", async () => {
  const bridge = createMemoryBridge({ snapshot: snapshot([{ text: "Ship the tasks view" }]) });
  let taskId = "";
  await withSession(bridge, async (session) => {
    const promoted = await promoteChecklistItem(session, NOTE_ID, 0);
    assert.equal(promoted.status, "committed");
    taskId = promoted.taskId;
    const undone = await undoPromotion(session, taskId);
    assert.equal(undone.status, "committed");
  });

  await withSession(bridge, async (session) => {
    const state = session.store.getState();
    assert.equal(state.tasks.size, 0);
    assert.equal(
      documentOf(state).markdown,
      "# Checklist note\n\n- [ ] Ship the tasks view\n",
      "the note body is exactly what it was before the promotion",
    );
    assert.equal(checklistItems(documentOf(state).documentJson)[0]?.taskId, null);
    assert.equal(projectPromotionSource(state)?.candidates.length, 1);
  });
});

test("a refused write leaves the workspace untouched", async () => {
  const bridge = createMemoryBridge({
    snapshot: snapshot([{ text: "Something else" }], [linkedTask()]),
  });
  await withSession(bridge, async (session) => {
    const before = documentOf(session.store.getState()).markdown;
    const refused = await toggleTask(session, "task-1");
    assert.equal(refused.status, "refused");
    assert.equal(session.store.getState().tasks.get("task-1")?.status, "todo");
    assert.equal(documentOf(session.store.getState()).markdown, before);
  });
});
