import { schema as basicSchema } from "prosemirror-schema-basic";
import type { NodeSpec } from "prosemirror-model";
import { LANGUAGE_CLASS, textAlignmentAttributes, textAlignmentFromDom } from "./attributes";

export const paragraphSpec: NodeSpec = {
  ...basicSchema.spec.nodes.get("paragraph"),
  attrs: {
    textAlign: { default: "left" },
  },
  toDOM: (node) => ["p", textAlignmentAttributes(node), 0],
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => ({ textAlign: textAlignmentFromDom(dom) }),
    },
  ],
};

export const headingSpec: NodeSpec = {
  ...basicSchema.spec.nodes.get("heading"),
  attrs: {
    level: { default: 1 },
    textAlign: { default: "left" },
  },
  toDOM: (node) => [`h${node.attrs.level}`, textAlignmentAttributes(node), 0],
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement) => ({ level, textAlign: textAlignmentFromDom(dom) }),
  })),
};

export const rawMarkdownSpec: NodeSpec = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  toDOM: () => [
    "pre",
    {
      class: "unsupported-markdown-source",
      "data-unsupported-markdown": "true",
    },
    ["code", 0],
  ],
  parseDOM: [
    {
      tag: "pre[data-unsupported-markdown]",
      preserveWhitespace: "full",
    },
  ],
};

function codeBlockLanguage(dom: HTMLElement): string {
  const declared = dom.getAttribute("data-language");
  if (declared) return declared;
  const code = dom.querySelector("code");
  const source = code ?? dom;
  const fromData = source.getAttribute("data-language");
  if (fromData) return fromData;
  return source.getAttribute("class")?.match(LANGUAGE_CLASS)?.[1] ?? "";
}

export const codeBlockSpec: NodeSpec = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  attrs: {
    params: { default: "" },
  },
  toDOM: (node) => ["pre", { "data-language": String(node.attrs.params) || null }, ["code", 0]],
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (dom) => ({ params: codeBlockLanguage(dom) }),
    },
  ],
};
