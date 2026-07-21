import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingNode,
  QuoteNode,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  createEditor,
  type EditorState,
  type LexicalEditor,
} from "lexical";

import { createCorpus } from "../corpus";
import type {
  BlockCount,
  CanonicalBlock,
  EditorCandidate,
  PreparedState,
} from "../types";

function appendBlock(block: CanonicalBlock): void {
  const text = $createTextNode(block.text);
  if (block.kind === "heading") {
    $getRoot().append($createHeadingNode("h2").append(text));
    return;
  }
  if (block.kind === "quote") {
    $getRoot().append($createQuoteNode().append(text));
    return;
  }
  $getRoot().append($createParagraphNode().append(text));
}

function asState(state: PreparedState): EditorState {
  return state.value as EditorState;
}

function createLexicalEditor(): LexicalEditor {
  return createEditor({
    namespace: "skriuw-ui-architecture-spike",
    nodes: [HeadingNode, QuoteNode],
    onError(error) {
      throw error;
    },
    theme: {
      heading: { h2: "editor-heading" },
      paragraph: "editor-paragraph",
      quote: "editor-quote",
    },
  });
}

export function createLexicalCandidate(): EditorCandidate {
  const editor = createLexicalEditor();
  let preparations = 0;
  let mounts = 0;

  return {
    id: "lexical",
    label: "Direct Lexical",
    prepare(blockCount: BlockCount, noteCount: number) {
      preparations += 1;
      return Array.from({ length: noteCount }, (_, noteIndex) => {
        editor.update(
          () => {
            const root = $getRoot();
            root.clear();
            for (const block of createCorpus(blockCount, noteIndex)) {
              appendBlock(block);
            }
          },
          { discrete: true, tag: `prepare-${blockCount}-${noteIndex}` },
        );
        return {
          id: `lexical-${blockCount}-${noteIndex}`,
          value: editor.getEditorState().clone(null),
        };
      });
    },
    mount(host: HTMLElement, initial: PreparedState) {
      mounts += 1;
      editor.setRootElement(host);
      editor.setEditorState(asState(initial), { tag: "initial-state" });
    },
    install(state: PreparedState) {
      editor.setEditorState(asState(state), { tag: "cached-note-switch" });
    },
    edit(sampleIndex: number) {
      editor.update(
        () => {
          const text = $getRoot().getFirstDescendant();
          if ($isTextNode(text)) {
            text.spliceText(text.getTextContentSize(), 0, String(sampleIndex % 10));
          }
        },
        { discrete: true, tag: "typing-sample" },
      );
    },
    preparationCount() {
      return preparations;
    },
    mountCount() {
      return mounts;
    },
    domNodeCount() {
      return editor.getRootElement()?.querySelectorAll("*").length ?? 0;
    },
    destroy() {
      editor.setRootElement(null);
    },
  };
}
