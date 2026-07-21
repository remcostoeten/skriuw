import type { Node as ProseMirrorNode } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";

import { createCorpus } from "../corpus";
import type {
  BlockCount,
  CanonicalBlock,
  EditorCandidate,
  PreparedState,
} from "../types";

function toNode(block: CanonicalBlock): ProseMirrorNode {
  const text = schema.text(block.text);
  if (block.kind === "heading") {
    return schema.node("heading", { level: 2 }, text);
  }
  const paragraph = schema.node("paragraph", null, text);
  if (block.kind === "quote") {
    return schema.node("blockquote", null, paragraph);
  }
  return paragraph;
}

function asState(state: PreparedState): EditorState {
  return state.value as EditorState;
}

export function createProseMirrorCandidate(): EditorCandidate {
  let view: EditorView | null = null;
  let preparations = 0;
  let mounts = 0;

  return {
    id: "prosemirror",
    label: "Direct ProseMirror",
    prepare(blockCount: BlockCount, noteCount: number) {
      preparations += 1;
      return Array.from({ length: noteCount }, (_, noteIndex) => {
        const doc = schema.node(
          "doc",
          null,
          createCorpus(blockCount, noteIndex).map(toNode),
        );
        return {
          id: `prosemirror-${blockCount}-${noteIndex}`,
          value: EditorState.create({ doc }),
        };
      });
    },
    mount(host: HTMLElement, initial: PreparedState) {
      mounts += 1;
      view = new EditorView(
        { mount: host },
        {
          state: asState(initial),
          dispatchTransaction(transaction) {
            if (view) {
              view.updateState(view.state.apply(transaction));
            }
          },
        },
      );
    },
    install(state: PreparedState) {
      view?.updateState(asState(state));
    },
    edit(sampleIndex: number) {
      if (view) {
        view.dispatch(view.state.tr.insertText(String(sampleIndex % 10), 1));
      }
    },
    preparationCount() {
      return preparations;
    },
    mountCount() {
      return mounts;
    },
    domNodeCount() {
      return view?.dom.querySelectorAll("*").length ?? 0;
    },
    destroy() {
      view?.destroy();
      view = null;
    },
  };
}
