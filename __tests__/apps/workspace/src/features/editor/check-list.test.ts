import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
  wrapLineInCheckList,
} from "@/features/editor/schema";

function stateWithText(text: string): EditorState {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, plugins: createProductPlugins() });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );
}

function typeText(state: EditorState, text: string): EditorState {
  let current = state;
  const view = {
    composing: false,
    get state() {
      return current;
    },
    dispatch(transaction: Transaction) {
      current = current.apply(transaction);
    },
  };
  const { from, to } = current.selection;
  const handled = current.plugins.some((plugin) => {
    const handleTextInput = (
      plugin.props as {
        handleTextInput?: (view: unknown, from: number, to: number, text: string) => boolean;
      }
    ).handleTextInput;
    return handleTextInput?.call(plugin, view, from, to, text) ?? false;
  });
  if (!handled) {
    current = current.apply(current.tr.insertText(text, from, to));
  }
  return current;
}

function stateWithLines(lines: readonly string[], cursorLine: number): EditorState {
  const hardBreak = productSchema.nodes.hard_break;
  assert.ok(hardBreak);
  const inline = lines.flatMap((line, index) => [
    ...(index > 0 ? [hardBreak.create()] : []),
    ...(line ? [productSchema.text(line)] : []),
  ]);
  const doc = productSchema.node("doc", null, [productSchema.node("paragraph", null, inline)]);
  const state = EditorState.create({ doc, plugins: createProductPlugins() });
  const cursor =
    1 + lines.slice(0, cursorLine + 1).reduce((size, line) => size + line.length, 0) + cursorLine;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursor)));
}

function blockSummary(state: EditorState): string[] {
  const blocks: string[] = [];
  state.doc.forEach((block) => {
    let breaks = 0;
    block.descendants((node) => {
      if (node.type.name === "hard_break") breaks += 1;
    });
    blocks.push(`${block.type.name}:${block.textContent}${breaks ? `:breaks=${breaks}` : ""}`);
  });
  return blocks;
}

function checkDocument(
  items: readonly { checked: boolean; text: string }[],
): ReturnType<typeof productSchema.node> {
  return productSchema.node("doc", null, [
    productSchema.node(
      "check_list",
      null,
      items.map((item) =>
        productSchema.node("check_item", { checked: item.checked }, [
          productSchema.node("paragraph", null, [productSchema.text(item.text)]),
        ]),
      ),
    ),
  ]);
}

test("typing [] followed by space starts an unchecked check list", () => {
  const state = typeText(stateWithText("[]"), " ");
  const list = state.doc.firstChild;
  assert.ok(list);
  assert.equal(list.type.name, "check_list");
  assert.equal(list.firstChild?.type.name, "check_item");
  assert.equal(list.firstChild?.attrs.checked, false);
});

test("typing [x] followed by space starts a checked check list", () => {
  const state = typeText(stateWithText("[x]"), " ");
  const list = state.doc.firstChild;
  assert.ok(list);
  assert.equal(list.type.name, "check_list");
  assert.equal(list.firstChild?.attrs.checked, true);
});

test("check lists serialize to GFM task-list markdown and parse back", () => {
  const markdown = serializeProductMarkdown(
    checkDocument([
      { checked: false, text: "buy milk" },
      { checked: true, text: "ship it" },
    ]),
  );
  assert.ok(markdown.includes("- [ ] buy milk"));
  assert.ok(markdown.includes("- [x] ship it"));

  const reparsed = parseProductMarkdown(markdown).firstChild;
  assert.equal(reparsed?.type.name, "check_list");
  assert.equal(reparsed?.child(0).attrs.checked, false);
  assert.equal(reparsed?.child(0).textContent, "buy milk");
  assert.equal(reparsed?.child(1).attrs.checked, true);
});

test("task-list markdown parses back into check lists", () => {
  const parsed = parseProductMarkdown("- [ ] buy milk\n\n- [x] ship it");
  const list = parsed.firstChild;
  assert.ok(list);
  assert.equal(list.type.name, "check_list");
  assert.equal(list.childCount, 2);
  assert.equal(list.child(0).attrs.checked, false);
  assert.equal(list.child(0).textContent, "buy milk");
  assert.equal(list.child(1).attrs.checked, true);
  assert.equal(list.child(1).textContent, "ship it");
});

test("a bullet list mixing plain and checkbox items splits into runs", () => {
  const parsed = parseProductMarkdown("- plain one\n- [ ] task\n- plain two");
  assert.equal(parsed.childCount, 3);
  assert.equal(parsed.child(0).type.name, "bullet_list");
  assert.equal(parsed.child(0).textContent, "plain one");
  assert.equal(parsed.child(1).type.name, "check_list");
  assert.equal(parsed.child(1).textContent, "task");
  assert.equal(parsed.child(2).type.name, "bullet_list");
  assert.equal(parsed.child(2).textContent, "plain two");
});

test("plain bullet lists are untouched by the checkbox upgrade", () => {
  const parsed = parseProductMarkdown("- alpha\n- beta");
  assert.equal(parsed.childCount, 1);
  assert.equal(parsed.firstChild?.type.name, "bullet_list");
  assert.equal(parsed.firstChild?.childCount, 2);
});

test("typing [ ] on the line after a break turns only that line into a task (#494)", () => {
  let state = stateWithLines(["Groceries", ""], 1);
  for (const character of "[ ] milk") state = typeText(state, character);
  assert.deepEqual(blockSummary(state), ["paragraph:Groceries", "check_list:milk"]);
  assert.equal(state.doc.child(1).firstChild?.childCount, 1);
});

test("typing [ ] right after an inline tag chip stays literal text", () => {
  const tagRef = productSchema.nodes.tag_ref;
  assert.ok(tagRef);
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [tagRef.create({ id: "tag-1", label: "home" })]),
  ]);
  let state = EditorState.create({ doc, plugins: createProductPlugins() });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  for (const character of "[ ] ") state = typeText(state, character);
  assert.equal(state.doc.firstChild?.type.name, "paragraph");
  assert.equal(state.doc.firstChild?.textContent, "[ ] ");
});

test("the check list command wraps only the cursor line of a multi-line paragraph (#494)", () => {
  let state = stateWithLines(["one", "two", "three"], 1);
  assert.ok(
    wrapLineInCheckList(state, (transaction) => {
      state = state.apply(transaction);
    }),
  );
  state = typeText(state, "!");
  assert.deepEqual(blockSummary(state), ["paragraph:one", "check_list:two!", "paragraph:three"]);
});

test("the check list command on an empty trailing line puts typed text beside the checkbox (#494)", () => {
  let state = stateWithLines(["That's most of it.", ""], 1);
  assert.ok(
    wrapLineInCheckList(state, (transaction) => {
      state = state.apply(transaction);
    }),
  );
  state = typeText(state, "my task");
  assert.deepEqual(blockSummary(state), ["paragraph:That's most of it.", "check_list:my task"]);
  const item = state.doc.child(1).firstChild;
  assert.equal(item?.type.name, "check_item");
  assert.equal(item?.firstChild?.textContent, "my task");
});
