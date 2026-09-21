import assert from "node:assert/strict";
import test from "node:test";
import type { MarkType } from "prosemirror-model";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  linkPastedText,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function requiredMark(name: string): MarkType {
  const mark = productSchema.marks[name];
  assert.ok(mark, `schema mark ${name} exists`);
  return mark;
}

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

function pressModU(state: EditorState): EditorState {
  let current = state;
  const view = {
    get state() {
      return current;
    },
    dispatch(transaction: Transaction) {
      current = current.apply(transaction);
    },
  };
  const event = {
    key: "u",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: () => undefined,
  } as KeyboardEvent;
  const handled = current.plugins.some((plugin) => {
    const handleKeyDown = (plugin.props as {
      handleKeyDown?: (view: unknown, event: KeyboardEvent) => boolean;
    }).handleKeyDown;
    return handleKeyDown?.call(plugin, view, event) ?? false;
  });
  assert.equal(handled, true);
  return current;
}

function markedRange(state: EditorState, markName: string): boolean {
  const paragraph = state.doc.firstChild;
  assert.ok(paragraph);
  return state.doc.rangeHasMark(1, 1 + paragraph.content.size, requiredMark(markName));
}

test("typing the closing ** applies the strong mark and strips delimiters", () => {
  const state = typeText(stateWithText("**bold*"), "*");
  assert.equal(state.doc.textContent, "bold");
  assert.ok(markedRange(state, "strong"));
});

test("typing the closing * applies the em mark", () => {
  const state = typeText(stateWithText("some *word"), "*");
  assert.equal(state.doc.textContent, "some word");
  const em = requiredMark("em");
  assert.ok(state.doc.rangeHasMark(6, 10, em));
  assert.equal(state.doc.rangeHasMark(1, 5, em), false);
});

test("typing the closing ` applies the code mark", () => {
  const state = typeText(stateWithText("`ls -la"), "`");
  assert.equal(state.doc.textContent, "ls -la");
  assert.ok(markedRange(state, "code"));
});

test("typing the closing ~~ applies the strikethrough mark", () => {
  const state = typeText(stateWithText("~~gone~"), "~");
  assert.equal(state.doc.textContent, "gone");
  assert.ok(markedRange(state, "strikethrough"));
});

test("Mod-u toggles underline on the selected text", () => {
  const initial = stateWithText("underlined");
  const selected = initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, 1, 11)));
  const underlined = pressModU(selected);
  assert.ok(markedRange(underlined, "underline"));
});

test("a lone underscore inside a word never italicizes", () => {
  const state = typeText(stateWithText("snake_case"), "_");
  assert.equal(state.doc.textContent, "snake_case_");
  assert.equal(markedRange(state, "em"), false);
});

test("typing --- inserts a horizontal rule", () => {
  let state = stateWithText("");
  state = typeText(state, "-");
  state = typeText(state, "-");
  state = typeText(state, "-");
  let sawRule = false;
  state.doc.descendants((node) => {
    if (node.type.name === "horizontal_rule") sawRule = true;
    return true;
  });
  assert.ok(sawRule);
});

test("typing after --- keeps the horizontal rule and lands in a paragraph below", () => {
  let state = stateWithText("");
  state = typeText(state, "-");
  state = typeText(state, "-");
  state = typeText(state, "-");
  state = typeText(state, " ");
  assert.equal(state.doc.firstChild?.type.name, "horizontal_rule");
  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.child(1).type.name, "paragraph");
  assert.equal(state.doc.child(1).textContent, " ");
});

test("typing # followed by space turns the block into an h1", () => {
  const state = typeText(stateWithText("#"), " ");
  const first = state.doc.firstChild;
  assert.ok(first);
  assert.equal(first.type.name, "heading");
  assert.equal(first.attrs.level, 1);
  assert.equal(first.textContent, "");
});

test("typing ### followed by space turns the block into an h3", () => {
  const state = typeText(stateWithText("###"), " ");
  const first = state.doc.firstChild;
  assert.ok(first);
  assert.equal(first.type.name, "heading");
  assert.equal(first.attrs.level, 3);
});

test("typing ###### followed by space turns the block into an h6", () => {
  const state = typeText(stateWithText("######"), " ");
  const first = state.doc.firstChild;
  assert.ok(first);
  assert.equal(first.type.name, "heading");
  assert.equal(first.attrs.level, 6);
});

test("typing - followed by space starts a bullet list", () => {
  const state = typeText(stateWithText("-"), " ");
  assert.equal(state.doc.firstChild?.type.name, "bullet_list");
});

test("typing 1. followed by space starts an ordered list", () => {
  const state = typeText(stateWithText("1."), " ");
  assert.equal(state.doc.firstChild?.type.name, "ordered_list");
});

test("typing > followed by space starts a blockquote", () => {
  const state = typeText(stateWithText(">"), " ");
  assert.equal(state.doc.firstChild?.type.name, "blockquote");
});

test("typing ``` turns the block into a code block", () => {
  const state = typeText(stateWithText("``"), "`");
  assert.equal(state.doc.firstChild?.type.name, "code_block");
});

test("typing the closing ) of [text](url) creates a link", () => {
  const state = typeText(stateWithText("see [docs](https://example.com"), ")");
  assert.equal(state.doc.textContent, "see docs");
  const link = requiredMark("link");
  assert.ok(state.doc.rangeHasMark(5, 9, link));
  assert.equal(state.doc.rangeHasMark(1, 4, link), false);
  let href = "";
  state.doc.nodesBetween(5, 9, (node) => {
    const mark = link.isInSet(node.marks);
    if (mark) href = String(mark.attrs.href);
    return true;
  });
  assert.equal(href, "https://example.com");
});

test("link syntax inside a code mark stays literal", () => {
  const code = requiredMark("code");
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("[docs](https://example.com", [code.create()]),
    ]),
  ]);
  let state = EditorState.create({ doc, plugins: createProductPlugins() });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );
  const typed = typeText(state, ")");
  assert.equal(typed.doc.rangeHasMark(1, typed.doc.content.size - 1, requiredMark("link")), false);
});

test("strikethrough survives the markdown roundtrip", () => {
  const strikethrough = requiredMark("strikethrough");
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("gone", [strikethrough.create()]),
    ]),
  ]);
  const markdown = serializeProductMarkdown(doc);
  assert.ok(markdown.includes("~~gone~~"));
  const parsed = parseProductMarkdown(markdown);
  assert.equal(parsed.textContent, "gone");
  assert.ok(parsed.rangeHasMark(1, 5, strikethrough));
});

test("typing whitespace after a bare URL links it and keeps the whitespace", () => {
  const state = typeText(stateWithText("see https://example.com"), " ");
  assert.equal(state.doc.textContent, "see https://example.com ");
  const link = requiredMark("link");
  assert.ok(state.doc.rangeHasMark(5, 24, link));
  assert.equal(state.doc.rangeHasMark(1, 4, link), false);
});

test("autolinking a www URL normalizes the href to https", () => {
  const state = typeText(stateWithText("go www.example.com"), " ");
  let href = "";
  state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "link") href = String(mark.attrs.href);
    }
    return true;
  });
  assert.equal(href, "https://www.example.com");
  assert.equal(state.doc.textContent, "go www.example.com ");
});

test("autolinking does not fire inside a code block", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("code_block", null, [productSchema.text("https://example.com")]),
  ]);
  let state = EditorState.create({ doc, plugins: createProductPlugins() });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );
  const typed = typeText(state, " ");
  assert.equal(typed.doc.textContent, "https://example.com ");
  assert.equal(
    typed.doc.rangeHasMark(1, typed.doc.content.size - 1, requiredMark("link")),
    false,
  );
});

test("an already linked URL is not re-marked when more whitespace is typed", () => {
  const first = typeText(stateWithText("see https://example.com"), " ");
  const second = typeText(first, " ");
  assert.equal(second.doc.textContent, "see https://example.com  ");
});

test("bare URLs in markdown parse as links and round-trip as autolinks", () => {
  const doc = parseProductMarkdown("see https://example.com ok");
  let href = "";
  doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "link") href = String(mark.attrs.href);
    }
    return true;
  });
  assert.equal(href, "https://example.com");
  const once = serializeProductMarkdown(doc);
  assert.equal(once, "see <https://example.com> ok");
  assert.equal(serializeProductMarkdown(parseProductMarkdown(once)), once);
});

test("prose that merely looks like a domain is left unlinked", () => {
  for (const text of ["a file config.json here", "mail bob@example.com"]) {
    const doc = parseProductMarkdown(text);
    let linked = false;
    doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "link") linked = true;
      }
      return true;
    });
    assert.equal(linked, false, `${text} stays plain`);
  }
});

function viewOverSelection(text: string, from: number, to: number) {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text(text)]),
  ]);
  let current = EditorState.create({ doc, plugins: createProductPlugins() });
  current = current.apply(current.tr.setSelection(TextSelection.create(current.doc, from, to)));
  return {
    view: {
      get state() {
        return current;
      },
      dispatch(transaction: Transaction) {
        current = current.apply(transaction);
      },
    },
    read: () => current,
  };
}

test("pasting a URL over a selection links the selection instead of replacing it", () => {
  const { view, read } = viewOverSelection("read the docs", 6, 13);
  assert.equal(linkPastedText(view as never, "https://example.com"), true);
  const state = read();
  assert.equal(state.doc.textContent, "read the docs");
  assert.ok(state.doc.rangeHasMark(6, 13, requiredMark("link")));
  assert.equal(state.doc.rangeHasMark(1, 5, requiredMark("link")), false);
});

test("pasting non-URL text over a selection falls through to default handling", () => {
  const { view, read } = viewOverSelection("read the docs", 6, 13);
  assert.equal(linkPastedText(view as never, "some plain words"), false);
  assert.equal(read().doc.textContent, "read the docs");
});

test("pasting a URL with no selection falls through to default handling", () => {
  const { view } = viewOverSelection("read the docs", 6, 6);
  assert.equal(linkPastedText(view as never, "https://example.com"), false);
});
