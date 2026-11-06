import type { NodeSpec } from "prosemirror-model";

export const toggleListSpec: NodeSpec = {
  content: "toggle_item+",
  group: "block",
  toDOM: () => ["ul", { class: "toggle-list", "data-toggle-list": "true" }, 0],
  parseDOM: [{ tag: "ul[data-toggle-list]", priority: 60 }],
};

export const toggleItemSpec: NodeSpec = {
  content: "(paragraph | heading) block*",
  defining: true,
  attrs: {
    open: { default: true },
  },
  toDOM: (node) => {
    const open = node.attrs.open !== false;
    return [
      "li",
      {
        class: "toggle-item",
        "data-toggle-open": open ? "true" : "false",
      },
      [
        "button",
        {
          class: "toggle-item-disclosure",
          type: "button",
          contenteditable: "false",
          "aria-expanded": open ? "true" : "false",
          "aria-label": `${open ? "Collapse" : "Expand"} collapsible item`,
          "aria-keyshortcuts": "Alt+Enter",
        },
      ],
      ["div", { class: "toggle-item-content" }, 0],
    ];
  },
  parseDOM: [
    {
      tag: "li[data-toggle-open]",
      priority: 60,
      getAttrs: (dom) => ({ open: dom.getAttribute("data-toggle-open") === "true" }),
    },
  ],
};
