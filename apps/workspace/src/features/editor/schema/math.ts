import type { NodeSpec } from "prosemirror-model";

export const mathBlockSpec: NodeSpec = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  toDOM: () => ["pre", { class: "math-block", "data-math": "block" }, ["code", 0]],
  parseDOM: [
    {
      tag: "pre[data-math='block']",
      priority: 60,
      preserveWhitespace: "full",
    },
  ],
};

export const mathInlineSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    tex: { default: "" },
  },
  leafText: (node) => `$${String(node.attrs.tex)}$`,
  toDOM: (node) => [
    "span",
    { class: "math-inline", "data-math": "inline", "data-tex": String(node.attrs.tex) },
    String(node.attrs.tex),
  ],
  parseDOM: [
    {
      tag: "span[data-math='inline']",
      priority: 60,
      getAttrs: (dom) => ({ tex: dom.getAttribute("data-tex") ?? dom.textContent ?? "" }),
    },
  ],
};
