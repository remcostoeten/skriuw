import type { NodeSpec } from "prosemirror-model";
import {
  EMPTY_EXCALIDRAW_SCENE_SOURCE,
  EXCALIDRAW_FENCE_LANGUAGE,
  parseExcalidrawFile,
  serializeExcalidrawScene,
} from "../excalidraw/scene";
import { LANGUAGE_CLASS } from "./attributes";

/**
 * @name excalidrawSceneFromFence
 * @description The stored scene for an `excalidraw` fence body, or null when
 * the body is not a readable drawing and should stay a code block.
 * @example
 * const scene = excalidrawSceneFromFence(token.content);
 */
export function excalidrawSceneFromFence(source: string): string | null {
  const parsed = parseExcalidrawFile(source);
  return parsed.ok ? serializeExcalidrawScene(parsed.scene) : null;
}

export const excalidrawSpec: NodeSpec = {
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  selectable: true,
  attrs: {
    scene: { default: EMPTY_EXCALIDRAW_SCENE_SOURCE },
  },
  toDOM: (node) => [
    "pre",
    { "data-skriuw-excalidraw": "true" },
    ["code", { class: `language-${EXCALIDRAW_FENCE_LANGUAGE}` }, String(node.attrs.scene)],
  ],
  parseDOM: [
    {
      tag: "pre",
      priority: 76,
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const code = dom.querySelector("code");
        const language = dom.hasAttribute("data-skriuw-excalidraw")
          ? EXCALIDRAW_FENCE_LANGUAGE
          : code?.className.match(LANGUAGE_CLASS)?.[1]?.toLowerCase();
        if (language !== EXCALIDRAW_FENCE_LANGUAGE) return false;
        const scene = excalidrawSceneFromFence(code?.textContent ?? dom.textContent ?? "");
        return scene === null ? false : { scene };
      },
    },
  ],
};
