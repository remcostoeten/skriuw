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
  RenderingStrategy,
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

type RetainedEditor = {
  surface: HTMLElement;
  view: EditorView;
};

function createView(host: HTMLElement, state: EditorState): EditorView {
  let mountedView: EditorView;
  mountedView = new EditorView(
    { mount: host },
    {
      state,
      dispatchTransaction(transaction) {
        mountedView.updateState(mountedView.state.apply(transaction));
      },
    },
  );
  return mountedView;
}

function countDomNodes(view: EditorView | null): number {
  return view ? view.dom.querySelectorAll("*").length + 1 : 0;
}

function setSurfaceActive(surface: HTMLElement, active: boolean): void {
  surface.dataset.active = String(active);
  surface.setAttribute("aria-hidden", String(!active));
  surface.inert = !active;
}

export function createProseMirrorCandidate(
  strategy: RenderingStrategy,
): EditorCandidate {
  let view: EditorView | null = null;
  const retainedEditors = new Map<string, RetainedEditor>();
  let activeId: string | null = null;
  let mountedHost: HTMLElement | null = null;
  let preparations = 0;
  let mounts = 0;

  return {
    id: "prosemirror",
    label: "Direct ProseMirror",
    strategy,
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
    mount(
      host: HTMLElement,
      states: readonly PreparedState[],
      initial: PreparedState,
    ) {
      mounts += 1;
      mountedHost = host;
      activeId = initial.id;
      if (strategy === "replace") {
        view = createView(host, asState(initial));
        return;
      }
      host.classList.add("editor-host--retained");
      for (const state of states) {
        const surface = document.createElement("div");
        surface.className = "editor-surface";
        setSurfaceActive(surface, state.id === initial.id);
        host.append(surface);
        retainedEditors.set(state.id, {
          surface,
          view: createView(surface, asState(state)),
        });
      }
    },
    install(state: PreparedState) {
      if (strategy === "replace") {
        view?.updateState(asState(state));
        activeId = state.id;
        return;
      }
      const current = activeId ? retainedEditors.get(activeId) : null;
      const next = retainedEditors.get(state.id);
      if (!next || current === next) {
        return;
      }
      if (current) {
        setSurfaceActive(current.surface, false);
      }
      setSurfaceActive(next.surface, true);
      activeId = state.id;
    },
    edit(sampleIndex: number) {
      const activeView =
        strategy === "replace"
          ? view
          : activeId
            ? retainedEditors.get(activeId)?.view ?? null
            : null;
      if (activeView) {
        activeView.dispatch(
          activeView.state.tr.insertText(String(sampleIndex % 10), 1),
        );
      }
    },
    preparationCount() {
      return preparations;
    },
    mountCount() {
      return mounts;
    },
    editorInstanceCount() {
      return strategy === "replace"
        ? Number(view !== null)
        : retainedEditors.size;
    },
    activeDomNodeCount() {
      const activeView =
        strategy === "replace"
          ? view
          : activeId
            ? retainedEditors.get(activeId)?.view ?? null
            : null;
      return countDomNodes(activeView);
    },
    totalDomNodeCount() {
      if (strategy === "replace") {
        return countDomNodes(view);
      }
      let count = 0;
      for (const editor of retainedEditors.values()) {
        count += countDomNodes(editor.view);
      }
      return count;
    },
    layoutHeight() {
      if (strategy === "replace") {
        return mountedHost?.offsetHeight ?? 0;
      }
      return activeId
        ? retainedEditors.get(activeId)?.surface.offsetHeight ?? 0
        : 0;
    },
    destroy() {
      view?.destroy();
      view = null;
      for (const editor of retainedEditors.values()) {
        editor.view.destroy();
        editor.surface.remove();
      }
      retainedEditors.clear();
      activeId = null;
      mountedHost?.classList.remove("editor-host--retained");
      mountedHost = null;
    },
  };
}
