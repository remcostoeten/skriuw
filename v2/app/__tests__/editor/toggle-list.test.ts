import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
  toggleItemAtSelection,
} from "../../src/editor/schema";

function paragraph(text: string) {
  return productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []);
}

function toggleDocument() {
  const listItem = productSchema.node("list_item", null, [paragraph("Nested detail")]);
  return productSchema.node("doc", null, [
    productSchema.node("toggle_list", null, [
      productSchema.node("toggle_item", { open: false }, [
        paragraph("Closed item"),
        productSchema.node("bullet_list", null, [listItem]),
      ]),
      productSchema.node("toggle_item", { open: true }, [paragraph("Open item")]),
    ]),
  ]);
}

function stateWithText(text: string): EditorState {
  const doc = productSchema.node("doc", null, [paragraph(text)]);
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
  if (!handled) current = current.apply(current.tr.insertText(text, from, to));
  return current;
}

test("toggle lists survive JSON and Markdown roundtrips with nested blocks", () => {
  const document = toggleDocument();
  assert.deepEqual(productSchema.nodeFromJSON(document.toJSON()).toJSON(), document.toJSON());

  const markdown = serializeProductMarkdown(document);
  assert.match(markdown, /- \[>\] Closed item/);
  assert.match(markdown, /- \[v\] Open item/);

  assert.deepEqual(parseProductMarkdown(markdown).toJSON(), document.toJSON());
});

test("toggle markers split mixed bullet lists into canonical runs", () => {
  const parsed = parseProductMarkdown("- plain\n- [>] closed\n- [v] open\n- plain again");
  assert.equal(parsed.childCount, 3);
  assert.equal(parsed.child(0).type.name, "bullet_list");
  assert.equal(parsed.child(1).type.name, "toggle_list");
  assert.equal(parsed.child(1).child(0).attrs.open, false);
  assert.equal(parsed.child(1).child(1).attrs.open, true);
  assert.equal(parsed.child(2).type.name, "bullet_list");
});

test("typing a toggle marker followed by space creates the requested state", () => {
  const collapsed = typeText(stateWithText("[>]"), " ");
  assert.equal(collapsed.doc.firstChild?.type.name, "toggle_list");
  assert.equal(collapsed.doc.firstChild?.firstChild?.attrs.open, false);

  const expanded = typeText(stateWithText("[v]"), " ");
  assert.equal(expanded.doc.firstChild?.type.name, "toggle_list");
  assert.equal(expanded.doc.firstChild?.firstChild?.attrs.open, true);
});

test("Alt-Enter disclosure command toggles the containing item", () => {
  const document = toggleDocument();
  let state = EditorState.create({ doc: document });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  let next = state;
  assert.equal(
    toggleItemAtSelection(state, (transaction) => {
      next = state.apply(transaction);
    }),
    true,
  );
  assert.equal(next.doc.firstChild?.firstChild?.attrs.open, true);
});

test("collapsing from disclosed content moves the selection into the summary", () => {
  const document = toggleDocument();
  let detailPosition = 0;
  document.descendants((node, position) => {
    if (node.isText && node.text === "Nested detail") {
      detailPosition = position + 1;
    }
  });
  let state = EditorState.create({ doc: document });
  state = state.apply(state.tr.setNodeMarkup(1, undefined, { open: true }));
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, detailPosition)),
  );
  let next = state;
  assert.equal(
    toggleItemAtSelection(state, (transaction) => {
      next = state.apply(transaction);
    }),
    true,
  );
  assert.equal(next.doc.firstChild?.firstChild?.attrs.open, false);
  assert.equal(next.selection.$from.parent.textContent, "Closed item");
});

test("disclosure DOM handlers remap hidden selections and respect read-only state", () => {
  const document = toggleDocument();
  let detailPosition = 0;
  document.descendants((node, position) => {
    if (node.isText && node.text === "Nested detail") {
      detailPosition = position + 1;
    }
  });
  let state = EditorState.create({ doc: document });
  state = state.apply(state.tr.setNodeMarkup(1, undefined, { open: true }));
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, detailPosition)),
  );
  const plugin = createProductPlugins().find(
    (candidate) =>
      candidate.props.handleDOMEvents?.click &&
      candidate.props.handleKeyDown,
  );
  assert.ok(plugin?.props.handleDOMEvents?.click);
  const target = {
    classList: { contains: (name: string) => name === "toggle-item-disclosure" },
  } as HTMLElement;
  const clickEvent = {
    target,
    preventDefault() {},
  } as unknown as Event;
  const view = {
    editable: true,
    get state() {
      return state;
    },
    posAtDOM: () => 3,
    dispatch(transaction: Transaction) {
      state = state.apply(transaction);
    },
  };
  assert.equal(
    plugin.props.handleDOMEvents.click(
      view as never,
      clickEvent,
    ),
    true,
  );
  assert.equal(state.selection.$from.parent.textContent, "Closed item");

  let dispatched = false;
  const keyEvent = {
    target,
    key: "Enter",
    preventDefault() {},
  } as unknown as KeyboardEvent;
  assert.equal(
    plugin.props.handleKeyDown?.(
      {
        ...view,
        editable: false,
        dispatch() {
          dispatched = true;
        },
      } as never,
      keyEvent,
    ),
    false,
  );
  assert.equal(dispatched, false);
});

test("toggle item DOM exposes a labelled keyboard-operable disclosure", () => {
  const item = toggleDocument().firstChild?.firstChild;
  assert.ok(item);
  const toDOM = productSchema.nodes.toggle_item?.spec.toDOM;
  assert.equal(typeof toDOM, "function");
  const rendered = toDOM?.(item) as unknown[];
  const button = rendered[2] as [string, Record<string, string>];
  assert.equal(button[0], "button");
  assert.equal(button[1]["aria-expanded"], "false");
  assert.equal(button[1]["aria-label"], "Expand collapsible item");
  assert.equal(button[1]["aria-keyshortcuts"], "Alt+Enter");
});
