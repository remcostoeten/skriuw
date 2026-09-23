import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { isRenderableMermaidFence } from "@/features/editor/mermaid-render";

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

test("a fenced code block with a language survives a markdown roundtrip", () => {
  const original = "```tsx\nexport function App() {}\n```";
  const reparsed = parseProductMarkdown(original);
  assert.equal(reparsed.firstChild?.type.name, "code_block");
  assert.equal(reparsed.firstChild?.attrs.params, "tsx");
  const markdown = serializeProductMarkdown(reparsed);
  assert.equal(markdown.trimEnd(), original);
  assert.equal(
    serializeProductMarkdown(codeBlockDocument("tsx", "export function App() {}")).trimEnd(),
    original,
  );
  const again = parseProductMarkdown(markdown);
  assert.equal(again.firstChild?.attrs.params, "tsx");
  assert.equal(again.firstChild?.textContent, "export function App() {}");
});

test("a language-less fenced block roundtrips without gaining a language", () => {
  const reparsed = parseProductMarkdown("```\njust text\n```");
  assert.equal(reparsed.firstChild?.attrs.params, "");
  assert.equal(serializeProductMarkdown(reparsed).trimEnd(), "```\njust text\n```");
  assert.equal(
    serializeProductMarkdown(codeBlockDocument("", "just text")).trimEnd(),
    "```\njust text\n```",
  );
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

test("a flowchart the editable parser rejects stays a renderable mermaid code block", () => {
  const source = "graph TD\n  subgraph Group\n    A --> B\n  end";
  const markdown = `\`\`\`mermaid\n${source}\n\`\`\``;
  const doc = parseProductMarkdown(`${markdown}\n`);
  assert.equal(doc.firstChild?.type.name, "code_block");
  assert.equal(doc.firstChild?.attrs.params, "mermaid");
  assert.equal(isRenderableMermaidFence("mermaid", doc.firstChild?.textContent ?? ""), true);
  assert.equal(serializeProductMarkdown(doc).trimEnd(), markdown);
});

test("sequence, state, class, and ER fences round-trip byte for byte as code blocks", () => {
  const sources = [
    "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi",
    "stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]",
    "classDiagram\n  class Note {\n    +string title\n  }",
    "erDiagram\n  NOTE ||--o{ TAG : has",
  ];
  for (const source of sources) {
    const markdown = `\`\`\`mermaid\n${source}\n\`\`\``;
    const doc = parseProductMarkdown(`${markdown}\n`);
    assert.equal(doc.firstChild?.type.name, "code_block", source);
    assert.equal(doc.firstChild?.attrs.params, "mermaid", source);
    assert.equal(
      isRenderableMermaidFence("mermaid", doc.firstChild?.textContent ?? ""),
      true,
      source,
    );
    assert.equal(serializeProductMarkdown(doc).trimEnd(), markdown);
  }
});

test("an unsupported mermaid family stays an ordinary fence that is not renderable", () => {
  const markdown = "```mermaid\ngantt\n  title Plan\n```";
  const doc = parseProductMarkdown(`${markdown}\n`);
  assert.equal(doc.firstChild?.type.name, "code_block");
  assert.equal(isRenderableMermaidFence("mermaid", doc.firstChild?.textContent ?? ""), false);
  assert.equal(serializeProductMarkdown(doc).trimEnd(), markdown);
});
