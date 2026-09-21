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
} from "lexical";

import { createBoundedCorpus } from "../corpus";
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

export function createLexicalBoundedCandidate(): EditorCandidate {
  const editor = createEditor({
    namespace: "skriuw-ui-architecture-bounded-lexical",
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
  const canonicalByState = new Map<string, CanonicalBlock[]>();
  let activeRoot: HTMLElement | null = null;
  let preparations = 0;
  let mounts = 0;

  return {
    id: "lexical",
    label: "Bounded Lexical",
    strategy: "bounded",
    prepare(blockCount: BlockCount, noteCount: number) {
      preparations += 1;
      canonicalByState.clear();
      return Array.from({ length: noteCount }, (_, noteIndex) => {
        const corpus = createBoundedCorpus(blockCount, noteIndex);
        const id = `lexical-bounded-${blockCount}-${noteIndex}`;
        canonicalByState.set(id, corpus.canonical);
        editor.update(
          () => {
            const root = $getRoot();
            root.clear();
            for (const block of corpus.rendered) {
              appendBlock(block);
            }
          },
          { discrete: true, tag: `prepare-bounded-${blockCount}-${noteIndex}` },
        );
        return {
          id,
          value: editor.getEditorState().clone(null),
          canonicalBlockCount: corpus.canonical.length,
          renderedBlockCount: corpus.rendered.length,
          windowStart: corpus.start,
          windowEnd: corpus.end,
        };
      });
    },
    mount(host: HTMLElement, _states: readonly PreparedState[], initial: PreparedState) {
      mounts += 1;
      activeRoot = host;
      editor.setRootElement(host);
      editor.setEditorState(asState(initial), { tag: "initial-bounded-state" });
    },
    install(state: PreparedState) {
      editor.setEditorState(asState(state), { tag: "cached-bounded-note-switch" });
    },
    edit(sampleIndex: number) {
      editor.update(
        () => {
          const text = $getRoot().getFirstDescendant();
          if ($isTextNode(text)) {
            text.spliceText(text.getTextContentSize(), 0, String(sampleIndex % 10));
          }
        },
        { discrete: true, tag: "bounded-typing-sample" },
      );
    },
    preparationCount() {
      return preparations;
    },
    mountCount() {
      return mounts;
    },
    editorInstanceCount() {
      return Number(activeRoot !== null);
    },
    activeDomNodeCount() {
      return activeRoot ? activeRoot.querySelectorAll("*").length + 1 : 0;
    },
    totalDomNodeCount() {
      return activeRoot ? activeRoot.querySelectorAll("*").length + 1 : 0;
    },
    layoutHeight() {
      return activeRoot?.offsetHeight ?? 0;
    },
    destroy() {
      editor.setRootElement(null);
      canonicalByState.clear();
      activeRoot = null;
    },
  };
}
