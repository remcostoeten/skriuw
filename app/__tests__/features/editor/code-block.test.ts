import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function codeBlockDocument(params: string, code: string) {
  return productSchema.node("doc", null, [
    productSchema.node("code_block", { params }, [productSchema.text(code)]),
  ]);
}

function pressArrowDown(state: EditorState): EditorState {
  let current = state;
  const view = {
    get state() {
      return current;
    },
    dispatch(transaction: Transaction) {
      current = current.apply(transaction);
    },
    endOfTextblock: () => false,
  };
  const event = {
    key: "ArrowDown",
    keyCode: 40,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  };
  for (const plugin of current.plugins) {
    if (plugin.props.handleKeyDown?.(view as never, event as never)) break;
  }
  return current;
}

function stateAtPosition(document: ReturnType<typeof codeBlockDocument>, position: number) {
  const state = EditorState.create({ doc: document, plugins: createProductPlugins() });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, position)));
}

test("code_block carries a params attribute defaulting to empty", () => {
  const codeBlock = productSchema.nodes.code_block;
  assert.ok(codeBlock);
  assert.equal(codeBlock.create().attrs.params, "");
});

test("a fenced block keeps its language when parsed", () => {
  const parsed = parseProductMarkdown("```ts\nconst a = 1;\n```");
  assert.equal(parsed.firstChild?.type.name, "code_block");
  assert.equal(parsed.firstChild?.attrs.params, "ts");
  assert.equal(parsed.firstChild?.textContent, "const a = 1;");
});

test("a language serializes back into the fence info string", () => {
  const markdown = serializeProductMarkdown(codeBlockDocument("rust", "fn main() {}"));
  assert.ok(markdown.startsWith("```rust\n"));
  assert.ok(markdown.trimEnd().endsWith("```"));
});

test("a language-less fence serializes as a bare fence", () => {
  const markdown = serializeProductMarkdown(codeBlockDocument("", "plain"));
  assert.equal(markdown.trimEnd(), "```\nplain\n```");
});

test("a fenced code block with a language survives a markdown roundtrip", () => {
  const original = "```tsx\nexport function App() {}\n```";
  const reparsed = parseProductMarkdown(original);
  const markdown = serializeProductMarkdown(reparsed);
  assert.equal(markdown.trimEnd(), original);
  const again = parseProductMarkdown(markdown);
  assert.equal(again.firstChild?.attrs.params, "tsx");
  assert.equal(again.firstChild?.textContent, "export function App() {}");
});

test("a language-less fenced block roundtrips without gaining a language", () => {
  const reparsed = parseProductMarkdown("```\njust text\n```");
  assert.equal(reparsed.firstChild?.attrs.params, "");
  assert.equal(serializeProductMarkdown(reparsed).trimEnd(), "```\njust text\n```");
});

test("ArrowDown exits a terminal code block from its final position", () => {
  const document = codeBlockDocument("ts", "const value = 1;");
  const state = pressArrowDown(stateAtPosition(document, document.content.size - 1));

  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.firstChild?.type.name, "code_block");
  assert.equal(state.doc.lastChild?.type.name, "paragraph");
  assert.equal(state.selection.$from.parent, state.doc.lastChild);
});

test("ArrowDown does not exit before the final code-block position", () => {
  const document = codeBlockDocument("", "one\ntwo");
  const state = pressArrowDown(stateAtPosition(document, 2));

  assert.equal(state.doc.childCount, 1);
  assert.equal(state.selection.from, 2);
});

test("ArrowDown does not add a paragraph when one already follows the code block", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("code_block", null, [productSchema.text("code")]),
    productSchema.node("paragraph", null, [productSchema.text("after")]),
  ]);
  const state = pressArrowDown(stateAtPosition(document, 5));

  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.lastChild?.textContent, "after");
});
