import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { looksLikeMarkdown, markdownPasteSlice } from "../../../src/features/editor/markdown-paste";
import { productSchema, serializeProductMarkdown } from "../../../src/features/editor/schema";

const NO_IMAGES: ReadonlySet<string> = new Set();

function emptyParagraphState(): EditorState {
  return EditorState.create({
    doc: productSchema.node("doc", null, [productSchema.node("paragraph")]),
  });
}

function codeBlockState(): EditorState {
  const state = EditorState.create({
    doc: productSchema.node("doc", null, [
      productSchema.node("code_block", { params: "" }, [productSchema.text("x")]),
    ]),
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
}

function pastedDocument(state: EditorState, text: string) {
  const slice = markdownPasteSlice(state, text, NO_IMAGES);
  assert.ok(slice, "expected the paste to be treated as Markdown");
  return state.apply(state.tr.replaceSelection(slice)).doc;
}

test("looksLikeMarkdown recognises block and inline syntax", () => {
  assert.equal(looksLikeMarkdown("# Heading"), true);
  assert.equal(looksLikeMarkdown("- item\n- other"), true);
  assert.equal(looksLikeMarkdown("1. first"), true);
  assert.equal(looksLikeMarkdown("> quote"), true);
  assert.equal(looksLikeMarkdown("```ts\nconst a = 1;\n```"), true);
  assert.equal(looksLikeMarkdown("---"), true);
  assert.equal(looksLikeMarkdown("| a | b |\n| - | - |"), true);
  assert.equal(looksLikeMarkdown("a **bold** word"), true);
  assert.equal(looksLikeMarkdown("a `code` word"), true);
  assert.equal(looksLikeMarkdown("see [docs](https://example.com)"), true);
  assert.equal(looksLikeMarkdown("see [[Tide Tables]]"), true);
});

test("looksLikeMarkdown leaves ordinary prose and code-ish text alone", () => {
  assert.equal(looksLikeMarkdown("Just a plain sentence."), false);
  assert.equal(looksLikeMarkdown("first line\nsecond line"), false);
  assert.equal(looksLikeMarkdown("const total = a * b * c;"), false);
  assert.equal(looksLikeMarkdown("some_snake_case_name"), false);
  assert.equal(looksLikeMarkdown("https://example.com/path"), false);
  assert.equal(looksLikeMarkdown("-5 degrees today"), false);
});

test("markdownPasteSlice renders a multi-block document", () => {
  const doc = pastedDocument(
    emptyParagraphState(),
    "# Title\n\nSome **bold** text.\n\n- one\n- two\n",
  );
  assert.equal(doc.firstChild?.type.name, "heading");
  assert.equal(doc.firstChild?.attrs.level, 1);
  assert.equal(doc.child(1).type.name, "paragraph");
  assert.equal(doc.child(2).type.name, "bullet_list");
  assert.equal(serializeProductMarkdown(doc).includes("**bold**"), true);
});

test("markdownPasteSlice renders tables, checklists and fenced code", () => {
  const doc = pastedDocument(
    emptyParagraphState(),
    "| Night | Weather |\n| --- | --- |\n| Mon | Clear |\n\n" +
      "- [x] Oil delivered\n- [ ] Repaint railing\n\n" +
      "```rust\nfn burn() {}\n```\n",
  );
  const types = [];
  doc.forEach((node) => types.push(node.type.name));
  assert.deepEqual(types, ["table", "check_list", "code_block"]);
  assert.equal(doc.child(1).firstChild?.attrs.checked, true);
  assert.equal(doc.child(1).child(1).attrs.checked, false);
  assert.equal(doc.child(2).attrs.params, "rust");
});

test("markdownPasteSlice keeps a single parsed paragraph inline", () => {
  const state = emptyParagraphState();
  const slice = markdownPasteSlice(state, "a **bold** word", NO_IMAGES);
  assert.ok(slice);
  assert.equal(slice.openStart, 1);
  assert.equal(slice.openEnd, 1);
  const doc = state.apply(state.tr.replaceSelection(slice)).doc;
  assert.equal(doc.childCount, 1);
  assert.equal(doc.firstChild?.type.name, "paragraph");
  assert.equal(serializeProductMarkdown(doc), "a **bold** word");
});

test("markdownPasteSlice declines plain text, empty text and code blocks", () => {
  assert.equal(markdownPasteSlice(emptyParagraphState(), "plain text", NO_IMAGES), null);
  assert.equal(markdownPasteSlice(emptyParagraphState(), "   \n ", NO_IMAGES), null);
  assert.equal(markdownPasteSlice(codeBlockState(), "# Heading", NO_IMAGES), null);
});
