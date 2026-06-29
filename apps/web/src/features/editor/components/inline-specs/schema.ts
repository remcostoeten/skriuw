import {
	BlockNoteSchema,
	defaultBlockSpecs,
	defaultInlineContentSpecs,
} from "@blocknote/core";
import { noteLinkInlineSpec } from "./note-link-spec";
import { tagInlineSpec } from "./tag-spec";
import { userInlineSpec } from "./user-spec";
import { createCheckListItem } from "../block-specs/checklist-item";
import { createFileTree } from "../block-specs/file-tree";
import { createSyntaxHighlightedCodeBlockSpec } from "../block-specs/code-highlighter";

export const editorSchema = BlockNoteSchema.create({
	blockSpecs: {
		...defaultBlockSpecs,
		// Fine-grained shiki/core spec: only the explicitly-imported languages get
		// bundled. The previous inline config imported the full `shiki` barrel,
		// which pulled the entire bundledLanguages registry into the build (~200
		// unused grammar chunks, e.g. wolfram/fortran/verilog).
		codeBlock: createSyntaxHighlightedCodeBlockSpec(),
		checkListItem: createCheckListItem(),
		fileTree: createFileTree(),
	},
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		noteLink: noteLinkInlineSpec,
		tag: tagInlineSpec,
		user: userInlineSpec,
	},
});

export type EditorSchema = typeof editorSchema;
