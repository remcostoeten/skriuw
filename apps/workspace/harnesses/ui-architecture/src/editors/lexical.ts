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
  RenderingStrategy,
} from "../types";

type RetainedEntry = {
  editor: LexicalEditor;
  root: HTMLElement;
};

function setRootActive(root: HTMLElement, active: boolean): void {
  root.dataset.active = String(active);
  root.setAttribute("aria-hidden", String(!active));
  root.inert = !active;
}

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

export function createLexicalCandidate(strategy: RenderingStrategy): EditorCandidate {
  const replaceEditor = strategy === "replace" ? createLexicalEditor() : null;
  let preparationEditor = strategy === "retained" ? createLexicalEditor() : null;
  const retainedEntries = new Map<string, RetainedEntry>();
  let activeEditor: LexicalEditor | null = null;
  let activeRoot: HTMLElement | null = null;
  let mountedHost: HTMLElement | null = null;
  let preparations = 0;
  let mounts = 0;

  const prepareWithEditor = (
    editor: LexicalEditor,
    blockCount: BlockCount,
    noteCount: number,
  ): PreparedState[] => Array.from({ length: noteCount }, (_, noteIndex) => {
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

  const activateRetained = (state: PreparedState): void => {
    const entry = retainedEntries.get(state.id);
    if (!entry) {
      throw new Error(`missing retained Lexical editor: ${state.id}`);
    }
    if (activeRoot !== entry.root) {
      if (activeRoot) {
        setRootActive(activeRoot, false);
      }
      setRootActive(entry.root, true);
      activeRoot = entry.root;
    }
    activeEditor = entry.editor;
  };

  return {
    id: "lexical",
    label: "Direct Lexical",
    strategy,
    prepare(blockCount: BlockCount, noteCount: number) {
      preparations += 1;
      const editor = replaceEditor ?? preparationEditor;
      if (!editor) {
        throw new Error("Lexical preparation editor is unavailable");
      }
      return prepareWithEditor(editor, blockCount, noteCount);
    },
    mount(host: HTMLElement, states: readonly PreparedState[], initial: PreparedState) {
      mounts += 1;
      mountedHost = host;
      if (replaceEditor) {
        replaceEditor.setRootElement(host);
        replaceEditor.setEditorState(asState(initial), { tag: "initial-state" });
        activeEditor = replaceEditor;
        activeRoot = host;
        return;
      }
      host.classList.add("editor-host--retained");
      states.forEach((state, index) => {
        const root = document.createElement("div");
        root.className = "editor-surface";
        setRootActive(root, false);
        const editor = index === 0 && preparationEditor
          ? preparationEditor
          : createLexicalEditor();
        host.append(root);
        editor.setRootElement(root);
        editor.setEditorState(asState(state), { tag: "initial-state" });
        retainedEntries.set(state.id, { editor, root });
      });
      preparationEditor = null;
      activateRetained(initial);
    },
    install(state: PreparedState) {
      if (replaceEditor) {
        replaceEditor.setEditorState(asState(state), { tag: "cached-note-switch" });
        return;
      }
      activateRetained(state);
    },
    edit(sampleIndex: number) {
      activeEditor?.update(
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
    editorInstanceCount() {
      return replaceEditor ? 1 : retainedEntries.size;
    },
    activeDomNodeCount() {
      return activeRoot ? activeRoot.querySelectorAll("*").length + 1 : 0;
    },
    totalDomNodeCount() {
      if (replaceEditor) {
        return activeRoot ? activeRoot.querySelectorAll("*").length + 1 : 0;
      }
      let count = 0;
      for (const entry of retainedEntries.values()) {
        count += entry.root.querySelectorAll("*").length + 1;
      }
      return count;
    },
    layoutHeight() {
      return activeRoot?.offsetHeight ?? 0;
    },
    destroy() {
      if (replaceEditor) {
        replaceEditor.setRootElement(null);
      }
      for (const entry of retainedEntries.values()) {
        entry.editor.setRootElement(null);
        entry.root.remove();
      }
      retainedEntries.clear();
      activeEditor = null;
      activeRoot = null;
      mountedHost?.classList.remove("editor-host--retained");
      mountedHost = null;
    },
  };
}
