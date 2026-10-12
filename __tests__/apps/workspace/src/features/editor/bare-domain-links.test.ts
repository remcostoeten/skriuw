import assert from "node:assert/strict";
import { test } from "vitest";
import type { MarkType, Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  linkPastedText,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";

function linkMark(): MarkType {
  const mark = productSchema.marks.link;
  assert.ok(mark, "schema mark link exists");
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

function links(doc: ProseMirrorNode): Array<{ text: string; href: string }> {
  const found: Array<{ text: string; href: string }> = [];
  doc.descendants((node) => {
    const link = node.marks.find((mark) => mark.type.name === "link");
    if (link && node.text) found.push({ text: node.text, href: String(link.attrs.href) });
    return true;
  });
  return found;
}

test("typing whitespace after a bare domain links it to https", () => {
  for (const domain of ["storybook.regeljelease.dev", "skriuw.com/docs"]) {
    const state = typeText(stateWithText(`see ${domain}`), " ");
    assert.equal(state.doc.textContent, `see ${domain} `);
    assert.deepEqual(links(state.doc), [{ text: domain, href: `https://${domain}` }]);
  }
});

test("typing after a bare domain leaves trailing punctuation unlinked", () => {
  for (const [typed, domain] of [
    ["visit skriuw.com.", "skriuw.com"],
    ["(skriuw.com/docs),", "skriuw.com/docs"],
    ["at skriuw.com:", "skriuw.com"],
  ] as const) {
    const state = typeText(stateWithText(typed), " ");
    assert.equal(state.doc.textContent, `${typed} `);
    assert.deepEqual(links(state.doc), [{ text: domain, href: `https://${domain}` }], typed);
  }
});

test("typing whitespace after filenames, versions, abbreviations, and emails links nothing", () => {
  for (const text of [
    "gen-css.mjs",
    "package.json",
    "Node.js",
    "v1.2.3",
    "e.g.",
    "src/skriuw.com",
    "bob@skriuw.com",
  ]) {
    const state = typeText(stateWithText(`run ${text}`), " ");
    assert.deepEqual(links(state.doc), [], text);
  }
});

test("typing after a bare domain inside inline code links nothing", () => {
  const code = productSchema.marks.code;
  assert.ok(code);
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text("skriuw.com", [code.create()])]),
  ]);
  let state = EditorState.create({ doc, plugins: createProductPlugins() });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );
  assert.deepEqual(links(typeText(state, " ").doc), []);
});

test("schemed URLs still link and now drop trailing punctuation", () => {
  const state = typeText(stateWithText("see https://example.com."), " ");
  assert.deepEqual(links(state.doc), [
    { text: "https://example.com", href: "https://example.com" },
  ]);
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

test("pasting a bare domain over a selection links the selection to https", () => {
  const { view, read } = viewOverSelection("read the docs", 6, 14);
  assert.equal(linkPastedText(view as never, " skriuw.com/docs\n"), true);
  assert.deepEqual(links(read().doc), [{ text: "the docs", href: "https://skriuw.com/docs" }]);
});

test("pasting a filename over a selection falls through to default handling", () => {
  const { view, read } = viewOverSelection("read the docs", 6, 13);
  assert.equal(linkPastedText(view as never, "package.json"), false);
  assert.deepEqual(links(read().doc), []);
});

test("bare domains in markdown parse as links and serialize back unchanged", () => {
  const markdown =
    "Docs at skriuw.com/docs, storybook.regeljelease.dev and www.example.com. Then (skriuw.com) or skriuw.com/a_b_c.";
  const doc = parseProductMarkdown(markdown);
  assert.deepEqual(links(doc), [
    { text: "skriuw.com/docs", href: "https://skriuw.com/docs" },
    { text: "storybook.regeljelease.dev", href: "https://storybook.regeljelease.dev" },
    { text: "www.example.com", href: "https://www.example.com" },
    { text: "skriuw.com", href: "https://skriuw.com" },
    { text: "skriuw.com/a_b_c", href: "https://skriuw.com/a_b_c" },
  ]);
  assert.equal(serializeProductMarkdown(doc), markdown);
});

test("markdown that only looks like a domain stays plain", () => {
  const markdown =
    "Run gen-css.mjs on Node.js v1.2.3, e.g. package.json, mail bob@skriuw.com, `skriuw.com`, [site](https://example.com/skriuw.com)";
  const doc = parseProductMarkdown(markdown);
  assert.deepEqual(links(doc), [{ text: "site", href: "https://example.com/skriuw.com" }]);
});

test("a typed bare-domain link serializes as the bare text", () => {
  const state = typeText(stateWithText("see skriuw.com"), " ");
  assert.equal(serializeProductMarkdown(state.doc), "see skriuw.com ");
});

test("a bare-domain link glued to other text keeps explicit link syntax", () => {
  const link = linkMark();
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("go"),
      productSchema.text("skriuw.com", [link.create({ href: "https://skriuw.com" })]),
    ]),
  ]);
  const markdown = serializeProductMarkdown(doc);
  assert.equal(markdown, "go[skriuw.com](https://skriuw.com)");
  assert.deepEqual(links(parseProductMarkdown(markdown)), [
    { text: "skriuw.com", href: "https://skriuw.com" },
  ]);
});

test("a link whose text differs from its domain keeps explicit link syntax", () => {
  const link = linkMark();
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("skriuw.com", [link.create({ href: "https://skriuw.com/docs" })]),
    ]),
  ]);
  assert.equal(serializeProductMarkdown(doc), "[skriuw.com](https://skriuw.com/docs)");
});
