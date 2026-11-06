import type { NodeSpec } from "prosemirror-model";
import {
  createDefaultDiagram,
  parseMermaidFlowchart,
  serializeMermaidFlowchart,
} from "../diagrams/model";
import { LANGUAGE_CLASS } from "./attributes";

export const diagramSpec: NodeSpec = {
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  selectable: true,
  attrs: {
    model: { default: createDefaultDiagram() },
  },
  toDOM: (node) => [
    "pre",
    {
      "data-skriuw-diagram": "true",
      "data-diagram-version": "1",
    },
    ["code", { class: "language-mermaid" }, serializeMermaidFlowchart(node.attrs.model)],
  ],
  parseDOM: [
    {
      tag: "pre[data-skriuw-diagram]",
      priority: 80,
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const parsed = parseMermaidFlowchart(dom.textContent ?? "");
        return parsed.ok ? { model: parsed.model } : false;
      },
    },
    {
      tag: "pre",
      priority: 70,
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const code = dom.querySelector("code");
        const language = code?.className.match(LANGUAGE_CLASS)?.[1]?.toLowerCase();
        if (language !== "mermaid" && language !== "diagram") return false;
        const parsed = parseMermaidFlowchart(code?.textContent ?? "");
        return parsed.ok ? { model: parsed.model } : false;
      },
    },
  ],
};
