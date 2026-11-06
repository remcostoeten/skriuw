import type { NodeSpec } from "prosemirror-model";

export const tagRefSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    id: {},
    label: { default: "" },
  },
  toDOM: (node) => [
    "span",
    {
      class: "reference-token reference-token-tag",
      "data-ref-kind": "tag",
      "data-ref-id": String(node.attrs.id),
      "data-ref-label": String(node.attrs.label),
    },
    `#${node.attrs.label}`,
  ],
  parseDOM: [
    {
      tag: "span[data-ref-kind='tag']",
      getAttrs: (dom) => {
        const id = dom.getAttribute("data-ref-id");
        return id ? { id, label: dom.getAttribute("data-ref-label") ?? "" } : false;
      },
    },
  ],
};

export const mentionRefSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    kind: {},
    id: {},
    label: { default: "" },
  },
  toDOM: (node) => [
    "span",
    {
      class: `reference-token reference-token-${node.attrs.kind}`,
      "data-ref-kind": String(node.attrs.kind),
      "data-ref-id": String(node.attrs.id),
      "data-ref-label": String(node.attrs.label),
    },
    `${node.attrs.kind === "person" ? "$" : "@"}${node.attrs.label}`,
  ],
  parseDOM: [
    {
      tag: "span[data-ref-kind='person'], span[data-ref-kind='note']",
      getAttrs: (dom) => {
        const id = dom.getAttribute("data-ref-id");
        const kind = dom.getAttribute("data-ref-kind");
        return id && (kind === "person" || kind === "note")
          ? { kind, id, label: dom.getAttribute("data-ref-label") ?? "" }
          : false;
      },
    },
  ],
};
