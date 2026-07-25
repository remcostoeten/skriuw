import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type Transaction } from "prosemirror-state";
import { setCodeBlockLanguage } from "../../src/editor/code-block-nodeview";
import { CODE_LANGUAGES, resolveHighlightLanguage } from "../../src/editor/code-highlight";
import { productSchema, serializeProductMarkdown } from "../../src/editor/schema";

function stateWithCodeBlock(params: string, code: string): EditorState {
  return EditorState.create({
    doc: productSchema.node("doc", null, [
      productSchema.node("code_block", { params }, [productSchema.text(code)]),
    ]),
  });
}

function applyLanguage(state: EditorState, pos: number, language: string): EditorState {
  let applied: Transaction | null = null;
  setCodeBlockLanguage(pos, language)(state, (transaction) => {
    applied = transaction;
  });
  return applied ? state.apply(applied) : state;
}

test("setting a language writes the params attribute", () => {
  const state = stateWithCodeBlock("", "const a = 1;");
  const next = applyLanguage(state, 0, "ts");
  assert.equal(next.doc.firstChild?.attrs.params, "ts");
  assert.equal(next.doc.firstChild?.textContent, "const a = 1;");
});

test("clearing a language writes an empty params attribute", () => {
  const state = stateWithCodeBlock("rust", "fn main() {}");
  const next = applyLanguage(state, 0, "");
  assert.equal(next.doc.firstChild?.attrs.params, "");
});

test("setting the language already in place is a no-op", () => {
  const state = stateWithCodeBlock("go", "func main() {}");
  assert.equal(setCodeBlockLanguage(0, "go")(state, undefined), false);
});

test("the command refuses a position that is not a code block", () => {
  const state = EditorState.create({
    doc: productSchema.node("doc", null, [
      productSchema.node("paragraph", null, [productSchema.text("prose")]),
    ]),
  });
  assert.equal(setCodeBlockLanguage(0, "ts")(state, undefined), false);
  assert.equal(setCodeBlockLanguage(99, "ts")(state, undefined), false);
});

test("a language change round-trips into the markdown fence", () => {
  const state = stateWithCodeBlock("", "SELECT 1;");
  const next = applyLanguage(state, 0, "sql");
  assert.equal(serializeProductMarkdown(next.doc).trimEnd(), "```sql\nSELECT 1;\n```");
});

test("every offered language except plain text resolves to a grammar", () => {
  for (const option of CODE_LANGUAGES) {
    const resolved = resolveHighlightLanguage(option.value);
    assert.equal(resolved === null, option.value === "", `${option.value} did not resolve`);
  }
});
