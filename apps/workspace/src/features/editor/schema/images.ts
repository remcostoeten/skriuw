import type { NodeSpec } from "prosemirror-model";

export const imageRefSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    id: {},
    alt: { default: "" },
    width: { default: null },
    height: { default: null },
  },
  toDOM: (node) => [
    "img",
    {
      class: "note-image",
      "data-image-id": String(node.attrs.id),
      alt: String(node.attrs.alt),
      ...(node.attrs.width ? { width: String(node.attrs.width) } : {}),
      ...(node.attrs.height ? { height: String(node.attrs.height) } : {}),
    },
  ],
  parseDOM: [
    {
      tag: "img[data-image-id]",
      getAttrs: (dom) => {
        const id = dom.getAttribute("data-image-id");
        return id
          ? {
              id,
              alt: dom.getAttribute("alt") ?? "",
              width: Number(dom.getAttribute("width")) || null,
              height: Number(dom.getAttribute("height")) || null,
            }
          : false;
      },
    },
  ],
};

export const blockedImageSpec: NodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: {
    src: { default: null },
    alt: { default: null },
    title: { default: null },
  },
  toDOM: (node) => [
    "span",
    {
      class: "blocked-markdown-image",
      "data-image-src": String(node.attrs.src ?? ""),
      "data-image-alt": String(node.attrs.alt ?? ""),
      role: "img",
      "aria-label": `Remote image blocked: ${String(node.attrs.alt ?? node.attrs.src ?? "image")}`,
    },
    String(node.attrs.alt ?? "Remote image blocked"),
  ],
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom) => ({
        src: dom.getAttribute("src"),
        alt: dom.getAttribute("alt"),
        title: dom.getAttribute("title"),
      }),
    },
  ],
};
