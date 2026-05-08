import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { noteLinkInlineSpec } from "./note-link-spec";
import { tagInlineSpec } from "./tag-spec";

export const editorSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: noteLinkInlineSpec,
    tag: tagInlineSpec,
  },
});

export type EditorSchema = typeof editorSchema;
