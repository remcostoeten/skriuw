import type { NodeSpec } from "prosemirror-model";
import { LANGUAGE_CLASS } from "./attributes";

export const DATABASE_FENCE_LANGUAGE = "database";

export function databaseFolderFromSource(source: string): string {
  return (
    source
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

export const databaseViewSpec: NodeSpec = {
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  selectable: true,
  attrs: {
    folder: { default: "" },
  },
  toDOM: (node) => [
    "pre",
    { "data-skriuw-database": "true" },
    ["code", { class: `language-${DATABASE_FENCE_LANGUAGE}` }, String(node.attrs.folder)],
  ],
  parseDOM: [
    {
      tag: "pre",
      priority: 75,
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const code = dom.querySelector("code");
        const language = dom.hasAttribute("data-skriuw-database")
          ? DATABASE_FENCE_LANGUAGE
          : code?.className.match(LANGUAGE_CLASS)?.[1]?.toLowerCase();
        if (language !== DATABASE_FENCE_LANGUAGE) return false;
        return { folder: databaseFolderFromSource(code?.textContent ?? dom.textContent ?? "") };
      },
    },
  ],
};
