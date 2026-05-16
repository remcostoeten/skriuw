import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { noteLinkInlineSpec } from "./note-link-spec";
import { tagInlineSpec } from "./tag-spec";
import { createCheckListItem } from "../block-specs/checklist-item";
import { createFileTree } from "../block-specs/file-tree";

const codeBlockSpec = createCodeBlockSpec({
  defaultLanguage: "text",
  createHighlighter: async () => {
    const [{ getSingletonHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki"),
      import("shiki/engine/javascript"),
    ]);
    return getSingletonHighlighter({
      engine: createJavaScriptRegexEngine(),
      themes: ["github-dark"],
      langs: [
        "bash",
        "css",
        "html",
        "javascript",
        "json",
        "jsx",
        "markdown",
        "python",
        "shell",
        "sql",
        "tsx",
        "typescript",
        "yaml",
      ],
    });
  },
});

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: codeBlockSpec,
    checkListItem: createCheckListItem(),
    fileTree: createFileTree(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: noteLinkInlineSpec,
    tag: tagInlineSpec,
  },
});

export type EditorSchema = typeof editorSchema;
