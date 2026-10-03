import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { inputRules } from "prosemirror-inputrules";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
  toggleCheckItemAtSelection,
} from "@/features/editor/schema";
import {
  checkItemToggle,
  nextOccurrenceAttrs,
  recurrenceChipDom,
  recurrenceInputRule,
} from "@/features/editor/tasks/recurrence";
import { documentSaveOperations } from "@/features/editor/tasks/linking";

const TODAY = "2026-10-01";

function checklist(attrs: Record<string, unknown>, text: string): ProseMirrorNode {
  return productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", attrs, [
        productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []),
      ]),
    ]),
  ]);
}

function items(document: ProseMirrorNode): ProseMirrorNode[] {
  const list: ProseMirrorNode[] = [];
  document.descendants((node) => {
    if (node.type.name === "check_item") list.push(node);
  });
  return list;
}

function typeInto(document: ProseMirrorNode, text: string): EditorState {
  let state = EditorState.create({
    doc: document,
    plugins: [inputRules({ rules: [recurrenceInputRule()] })],
  });
  state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
  for (const character of text) {
    let handled = false;
    const view = {
      composing: false,
      get state() {
        return state;
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction);
      },
    };
    const { from, to } = state.selection;
    for (const plugin of state.plugins) {
      const input = (
        plugin.props as {
          handleTextInput?: (view: unknown, from: number, to: number, text: string) => boolean;
        }
      ).handleTextInput;
      handled ||= input?.call(plugin, view, from, to, character) ?? false;
    }
    if (!handled) state = state.apply(state.tr.insertText(character, from, to));
  }
  return state;
}

test("a repeating task serializes the Obsidian Tasks recurrence before the due date", () => {
  const document = checklist(
    {
      checked: false,
      taskId: "task-1",
      blockId: "block-1",
      dueDate: "2026-10-01",
      recurrence: "every week",
    },
    "Water plants",
  );

  assert.equal(
    serializeProductMarkdown(document).trimEnd(),
    "- [ ] Water plants <!--skriuw-task:task-1:block-1--> \u{1F501} every week \u{1F4C5} 2026-10-01",
  );
});

test("the recurrence round-trips through Markdown without touching the title", () => {
  const original = checklist(
    {
      checked: false,
      taskId: "task-1",
      blockId: "block-1",
      dueDate: "2026-10-01",
      recurrence: "every 2 weeks",
    },
    "Water plants",
  );
  const parsed = parseProductMarkdown(serializeProductMarkdown(original));
  const [item] = items(parsed);

  assert.equal(item?.attrs.recurrence, "every 2 weeks");
  assert.equal(item?.attrs.dueDate, "2026-10-01");
  assert.equal(item?.attrs.taskId, "task-1");
  assert.equal(item?.textContent, "Water plants");
});

test("an Obsidian line with the tokens in another order still reads", () => {
  const parsed = parseProductMarkdown(
    "- [ ] Water plants \u{1F4C5} 2026-10-01 \u{1F501} Every Week <!--skriuw-task:task-1:block-1-->\n",
  );
  const [item] = items(parsed);

  assert.equal(item?.attrs.recurrence, "every week");
  assert.equal(item?.attrs.dueDate, "2026-10-01");
  assert.equal(item?.attrs.taskId, "task-1");
  assert.equal(item?.textContent, "Water plants");
});

test("a rule Skriuw cannot read stays literal text", () => {
  const parsed = parseProductMarkdown("- [ ] Water plants \u{1F501} every full moon\n");
  const [item] = items(parsed);

  assert.equal(item?.attrs.recurrence, null);
  assert.equal(item?.textContent, "Water plants \u{1F501} every full moon");
});

test("a repeating checkbox without a due date round-trips too", () => {
  const original = checklist({ checked: false, recurrence: "every day" }, "Stretch");
  const markdown = serializeProductMarkdown(original);
  assert.equal(markdown.trimEnd(), "- [ ] Stretch \u{1F501} every day");
  assert.equal(items(parseProductMarkdown(markdown))[0]?.attrs.recurrence, "every day");
});

test("typing every: and a space lifts the rule into the item", () => {
  const state = typeInto(checklist({ checked: false }, "Water plants"), " every:2_weeks ");
  const [item] = items(state.doc);

  assert.equal(item?.attrs.recurrence, "every 2 weeks");
  assert.equal(item?.textContent, "Water plants");
});

test("an unknown every: token stays text", () => {
  const state = typeInto(checklist({ checked: false }, "Water plants"), " every:fortnight ");
  const [item] = items(state.doc);

  assert.equal(item?.attrs.recurrence, null);
  assert.equal(item?.textContent, "Water plants every:fortnight ");
});

test("every: outside a checklist is ordinary text", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text("Meet")]),
  ]);
  const state = typeInto(document, " every:week ");
  assert.equal(state.doc.textContent, "Meet every:week ");
});

test("completing a repeating task inserts the next one below with a new identity", () => {
  const document = checklist(
    {
      checked: false,
      taskId: "task-1",
      blockId: "block-1",
      dueDate: "2026-10-01",
      recurrence: "every week",
    },
    "Water plants",
  );
  const state = EditorState.create({ doc: document });
  const item = items(document)[0]!;
  const next = state.apply(checkItemToggle(state, 1, item, TODAY));
  const [done, upcoming] = items(next.doc);

  assert.equal(done?.attrs.checked, true);
  assert.equal(done?.attrs.taskId, "task-1");
  assert.equal(upcoming?.attrs.checked, false);
  assert.equal(upcoming?.attrs.dueDate, "2026-10-08");
  assert.equal(upcoming?.attrs.recurrence, "every week");
  assert.equal(upcoming?.textContent, "Water plants");
  assert.ok(typeof upcoming?.attrs.taskId === "string");
  assert.notEqual(upcoming?.attrs.taskId, "task-1");
  assert.notEqual(upcoming?.attrs.blockId, "block-1");
  assert.notEqual(upcoming?.attrs.taskId, upcoming?.attrs.blockId);
});

test("the next occurrence of a linked task is promoted on the next save", () => {
  const document = checklist(
    { checked: false, taskId: "task-1", blockId: "block-1", recurrence: "every day" },
    "Stretch",
  );
  const state = EditorState.create({ doc: document });
  const next = state.apply(checkItemToggle(state, 1, items(document)[0]!, TODAY));
  const upcoming = items(next.doc)[1]!;
  const known = new Map([["task-1", {} as never]]);
  const operations = documentSaveOperations(
    next.doc,
    "note-a",
    { documentJson: next.doc.toJSON(), markdown: "", wordCount: 1, expectedRevision: 3 },
    known,
    10,
  );

  assert.equal(operations.length, 1);
  const [promotion] = operations;
  assert.equal(promotion?.type, "promote_checklist_task");
  assert.equal(
    promotion?.type === "promote_checklist_task" && promotion.task.id,
    upcoming.attrs.taskId,
  );
  assert.equal(
    promotion?.type === "promote_checklist_task" && promotion.task.dueDate,
    "2026-10-02",
  );
});

test("an undated repeating checkbox counts from today and stays unlinked", () => {
  const document = checklist({ checked: false, recurrence: "every day" }, "Stretch");
  const state = EditorState.create({ doc: document });
  const next = state.apply(checkItemToggle(state, 1, items(document)[0]!, TODAY));
  const upcoming = items(next.doc)[1];

  assert.equal(upcoming?.attrs.dueDate, "2026-10-02");
  assert.equal(upcoming?.attrs.taskId, null);
  assert.equal(upcoming?.attrs.blockId, null);
});

test("unchecking a repeating task does not create another", () => {
  const document = checklist({ checked: true, recurrence: "every day" }, "Stretch");
  const state = EditorState.create({ doc: document });
  const next = state.apply(checkItemToggle(state, 1, items(document)[0]!, TODAY));

  assert.equal(items(next.doc).length, 1);
  assert.equal(items(next.doc)[0]?.attrs.checked, false);
});

test("an item that does not repeat only flips", () => {
  const document = checklist({ checked: false, dueDate: "2026-10-01" }, "Ship it");
  const state = EditorState.create({ doc: document });
  const next = state.apply(checkItemToggle(state, 1, items(document)[0]!, TODAY));

  assert.equal(items(next.doc).length, 1);
  assert.equal(items(next.doc)[0]?.attrs.checked, true);
});

test("the keyboard toggle at the caret also repeats", () => {
  const document = checklist({ checked: false, recurrence: "every month" }, "Pay rent");
  let state = EditorState.create({ doc: document });
  state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
  toggleCheckItemAtSelection(state, (transaction) => {
    state = state.apply(transaction);
  });

  assert.equal(items(state.doc).length, 2);
  assert.equal(items(state.doc)[1]?.attrs.recurrence, "every month");
});

test("next occurrence attributes need a readable rule", () => {
  assert.equal(nextOccurrenceAttrs({ recurrence: "every full moon" }, TODAY), null);
  assert.equal(nextOccurrenceAttrs({ recurrence: null }, TODAY), null);
});

test("the chip names the rule for screen readers", () => {
  const [, attrs, label] = recurrenceChipDom("every week");
  assert.equal(label, "Weekly");
  assert.match(attrs["aria-label"] ?? "", /^Repeats every week\./);
});
