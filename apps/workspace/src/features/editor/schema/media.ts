import type { NodeSpec } from "prosemirror-model";

export const mediaKinds = ["video", "audio", "file"] as const;

export type MediaKind = (typeof mediaKinds)[number];

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && mediaKinds.includes(value as MediaKind);
}

/**
 * Derives the label shown for a media embed from its URL, so a freshly pasted
 * link reads as a file name rather than the whole address.
 */
export function mediaTitleFromSource(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0] ?? "";
  const lastSegment = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  try {
    return decodeURIComponent(lastSegment) || src;
  } catch {
    return lastSegment || src;
  }
}

export const mediaSpec: NodeSpec = {
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  attrs: {
    kind: { default: "video" },
    src: { default: "" },
    title: { default: "" },
    refId: { default: "" },
  },
  toDOM: (node) => {
    const kind = isMediaKind(node.attrs.kind) ? node.attrs.kind : "video";
    const src = String(node.attrs.src ?? "");
    const title = String(node.attrs.title ?? "");
    const refId = String(node.attrs.refId ?? "");
    if (kind === "file") {
      return [
        "a",
        {
          class: "note-media note-media-file",
          "data-media-file": "true",
          "data-media-title": title,
          href: src || "#",
        },
        title || src || "Untitled file",
      ];
    }
    return [
      kind,
      {
        class: "note-media",
        controls: "true",
        "data-media-title": title,
        ...(refId ? { "data-media-ref": refId } : {}),
        ...(src ? { src } : {}),
      },
    ];
  },
  parseDOM: [
    {
      tag: "a[data-media-file]",
      priority: 60,
      getAttrs: (dom) => ({
        kind: "file",
        src: dom.getAttribute("href") ?? "",
        title: dom.getAttribute("data-media-title") ?? dom.textContent ?? "",
      }),
    },
    {
      tag: "video",
      getAttrs: (dom) => ({
        kind: "video",
        src: dom.getAttribute("src") ?? "",
        title: dom.getAttribute("data-media-title") ?? "",
        refId: dom.getAttribute("data-media-ref") ?? "",
      }),
    },
    {
      tag: "audio",
      getAttrs: (dom) => ({
        kind: "audio",
        src: dom.getAttribute("src") ?? "",
        title: dom.getAttribute("data-media-title") ?? "",
        refId: dom.getAttribute("data-media-ref") ?? "",
      }),
    },
  ],
};
