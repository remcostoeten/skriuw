import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../src/editor/schema";

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
    const handleTextInput = (plugin.props as {
      handleTextInput?: (view: unknown, from: number, to: number, text: string) => boolean;
    }).handleTextInput;
    return handleTextInput?.call(plugin, view, from, to, text) ?? false;
  });
  if (!handled) {
    current = current.apply(current.tr.insertText(text, from, to));
  }
  return current;
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

test("check lists serialize to GFM task-list markdown", () => {
  const markdown = serializeProductMarkdown(
    checkDocument([
      { checked: false, text: "buy milk" },
      { checked: true, text: "ship it" },
    ]),
  );
  assert.ok(markdown.includes("- [ ] buy milk"));
  assert.ok(markdown.includes("- [x] ship it"));
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

test("check lists survive a full markdown roundtrip", () => {
  const original = checkDocument([
    { checked: true, text: "done thing" },
    { checked: false, text: "open thing" },
  ]);
  const reparsed = parseProductMarkdown(serializeProductMarkdown(original));
  assert.ok(reparsed.firstChild);
  assert.equal(reparsed.firstChild.type.name, "check_list");
  assert.equal(reparsed.firstChild.child(0).attrs.checked, true);
  assert.equal(reparsed.firstChild.child(0).textContent, "done thing");
  assert.equal(reparsed.firstChild.child(1).attrs.checked, false);
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
