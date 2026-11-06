import type { MarkSpec } from "prosemirror-model";
import { highlightColors, isHighlightColor } from "./attributes";

export const strikethroughSpec: MarkSpec = {
  parseDOM: [
    { tag: "s" },
    { tag: "del" },
    { tag: "strike" },
    { style: "text-decoration=line-through" },
  ],
  toDOM: () => ["s", 0],
};

export const underlineSpec: MarkSpec = {
  parseDOM: [{ tag: "u" }, { tag: "ins" }, { style: "text-decoration=underline" }],
  toDOM: () => ["u", 0],
};

const ANNOTATION_THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isAnnotationThreadId(value: unknown): value is string {
  return typeof value === "string" && ANNOTATION_THREAD_ID_PATTERN.test(value);
}

export const highlightSpec: MarkSpec = {
  attrs: {
    color: { default: "yellow" },
  },
  parseDOM: [
    {
      tag: "mark",
      getAttrs: (dom) => {
        const color = dom.getAttribute("data-skriuw-highlight");
        if (color === null && dom.getAttribute("data-skriuw-annotation") !== null) {
          return false;
        }
        return { color: isHighlightColor(color) ? color : "yellow" };
      },
    },
  ],
  toDOM: (mark) => {
    const color = isHighlightColor(mark.attrs.color) ? mark.attrs.color : "yellow";
    return [
      "mark",
      {
        "data-skriuw-highlight": color,
        style: `background-color: ${highlightColors[color]}`,
      },
      0,
    ];
  },
};

/**
 * Anchors a comment thread to a text range. The thread body lives in SQLite;
 * the document carries only this id.
 *
 * `inclusive: false` keeps typing at either edge outside the anchor, and
 * `excludes: ""` lets overlapping threads stack rather than evicting each
 * other — the default would make a mark exclude its own type.
 */
export const annotationSpec: MarkSpec = {
  attrs: {
    threadId: {},
  },
  inclusive: false,
  excludes: "",
  parseDOM: [
    {
      tag: "mark[data-skriuw-annotation]",
      getAttrs: (dom) => {
        const threadId = dom.getAttribute("data-skriuw-annotation");
        return isAnnotationThreadId(threadId) ? { threadId } : false;
      },
    },
  ],
  toDOM: (mark) => [
    "mark",
    {
      "data-skriuw-annotation": mark.attrs.threadId,
      "aria-details": `skriuw-annotation-${mark.attrs.threadId}`,
    },
    0,
  ],
};
