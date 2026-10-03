import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { dueDateChipDom, dueDateInputRule } from "@/features/editor/tasks/due-date";
import { documentSaveOperations } from "@/features/editor/tasks/linking";
import { inputRules } from "prosemirror-inputrules";

function checklist(attrs: Record<string, unknown>, text: string): ProseMirrorNode {
  return productSchema.node("doc", null, [
    productSchema.node("check_list", null, [
      productSchema.node("check_item", attrs, [
        productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []),
      ]),
    ]),
  ]);
}

function firstItem(document: ProseMirrorNode): ProseMirrorNode {
  const item = document.firstChild?.firstChild;
  assert.ok(item);
  return item;
}

function typeInto(document: ProseMirrorNode, text: string, today = "2026-09-30"): EditorState {
  let state = EditorState.create({
    doc: document,
    plugins: [inputRules({ rules: [dueDateInputRule(() => today)] })],
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

test("a dated task serializes as an Obsidian Tasks due date after the private marker", () => {
  const document = checklist(
    { checked: false, taskId: "task-1", blockId: "block-1", dueDate: "2026-10-01" },
    "Ship it",
  );

  assert.equal(
    serializeProductMarkdown(document).trimEnd(),
    "- [ ] Ship it <!--skriuw-task:task-1:block-1--> \u{1F4C5} 2026-10-01",
  );
});

test("the due date round-trips through Markdown without touching the title", () => {
  const original = checklist(
    { checked: true, taskId: "task-1", blockId: "block-1", dueDate: "2026-10-01" },
    "Ship it",
  );
  const markdown = serializeProductMarkdown(original);
  const parsed = parseProductMarkdown(markdown);

  assert.deepEqual(firstItem(parsed).attrs, firstItem(original).attrs);
  assert.equal(parsed.textContent, "Ship it");
  assert.equal(serializeProductMarkdown(parsed), markdown);
});

test("the marker and the date are read in either order", () => {
  const parsed = parseProductMarkdown(
    "- [ ] Ship it \u{1F4C5} 2026-10-01 <!--skriuw-task:task-1:block-1-->\n",
  );

  assert.equal(firstItem(parsed).attrs.taskId, "task-1");
  assert.equal(firstItem(parsed).attrs.dueDate, "2026-10-01");
  assert.equal(parsed.textContent, "Ship it");
});

test("a plain checkbox keeps its due date as document-only content", () => {
  const parsed = parseProductMarkdown("- [ ] Buy milk \u{1F4C5} 2026-10-01\n");

  assert.equal(firstItem(parsed).attrs.taskId, null);
  assert.equal(firstItem(parsed).attrs.dueDate, "2026-10-01");
  assert.equal(serializeProductMarkdown(parsed), "- [ ] Buy milk \u{1F4C5} 2026-10-01");
});

test("an empty dated item writes the token without a doubled space", () => {
  const document = checklist({ checked: false, dueDate: "2026-10-01" }, "");

  assert.equal(serializeProductMarkdown(document).trimEnd(), "- [ ] \u{1F4C5} 2026-10-01");
  assert.equal(
    firstItem(parseProductMarkdown("- [ ] \u{1F4C5} 2026-10-01")).attrs.dueDate,
    "2026-10-01",
  );
});

test("a token that names no calendar day stays literal text", () => {
  const markdown = "- [ ] Ship it \u{1F4C5} 2026-02-30\n";
  const parsed = parseProductMarkdown(markdown);

  assert.equal(firstItem(parsed).attrs.dueDate, null);
  assert.equal(parsed.textContent, "Ship it \u{1F4C5} 2026-02-30");
});

test("the task marker is lifted even when the title ends in formatted text", () => {
  const parsed = parseProductMarkdown("- [ ] Ship **it** <!--skriuw-task:task-1:block-1-->\n");

  assert.equal(firstItem(parsed).attrs.taskId, "task-1");
  assert.equal(parsed.textContent, "Ship it");
});

test("the chip renders a relative label with its state and an accessible name", () => {
  const [tag, attrs, label] = dueDateChipDom("2026-09-29", false, "2026-09-30");

  assert.equal(tag, "span");
  assert.equal(label, "Yesterday");
  assert.equal(attrs["data-due-state"], "overdue");
  assert.equal(attrs.tabindex, "0");
  assert.match(attrs["aria-label"] ?? "", /^Overdue, due Tuesday, September 29, 2026\./);
});

test("the checklist item renders the chip and the due date attribute only when dated", () => {
  const toDOM = productSchema.nodes.check_item?.spec.toDOM;
  assert.ok(toDOM);
  const dated = toDOM(
    firstItem(checklist({ checked: false, dueDate: "2026-10-01" }, "Ship")),
  ) as unknown[];
  const undated = toDOM(firstItem(checklist({ checked: false }, "Ship"))) as unknown[];

  assert.equal((dated[1] as Record<string, string>)["data-due-date"], "2026-10-01");
  assert.equal(dated.length, 5);
  assert.equal((undated[1] as Record<string, string>)["data-due-date"], undefined);
  assert.equal(undated.length, 4);
});

test("typing due: and a date then a space sets the date and removes the token", () => {
  const state = typeInto(
    checklist({ checked: false, taskId: "task-1", blockId: "block-1" }, "Ship it"),
    " due:tomorrow ",
  );

  assert.equal(firstItem(state.doc).attrs.dueDate, "2026-10-01");
  assert.equal(state.doc.textContent, "Ship it");
});

test("an unreadable due: token stays as typed", () => {
  const state = typeInto(checklist({ checked: false }, "Ship it"), " due:someday ");

  assert.equal(firstItem(state.doc).attrs.dueDate, null);
  assert.equal(state.doc.textContent, "Ship it due:someday ");
});

test("due: outside a checklist item is ordinary text", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text("Note")]),
  ]);
  const state = typeInto(document, " due:tomorrow ");

  assert.equal(state.doc.textContent, "Note due:tomorrow ");
});

test("promotion carries the checklist item's due date into the new task", () => {
  const document = checklist(
    { checked: false, taskId: "task-1", blockId: "block-1", dueDate: "2026-10-01" },
    "Ship",
  );
  const [operation] = documentSaveOperations(
    document,
    "note-1",
    {
      documentJson: document.toJSON(),
      markdown: serializeProductMarkdown(document),
      wordCount: 1,
      expectedRevision: 1,
    },
    new Map(),
    9,
  );

  assert.equal(operation?.type, "promote_checklist_task");
  assert.equal(
    operation?.type === "promote_checklist_task" && operation.task.dueDate,
    "2026-10-01",
  );
});
