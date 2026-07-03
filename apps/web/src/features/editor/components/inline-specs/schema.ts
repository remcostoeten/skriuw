import {
	BlockNoteSchema,
	defaultBlockSpecs,
	defaultInlineContentSpecs,
} from "@blocknote/core";
import { noteLinkInlineSpec } from "./note-link-spec";
import { tagInlineSpec } from "./tag-spec";
import { userInlineSpec } from "./user-spec";
import { personInlineSpec } from "./person-spec";
import { createCheckListItem } from "../block-specs/checklist-item";
import { createFileTree } from "../block-specs/file-tree";
import { CodeBlock } from "../block-specs/CodeBlock";

export const editorSchema = BlockNoteSchema.create({
	blockSpecs: {
		...defaultBlockSpecs,
		procode: CodeBlock(),
		checkListItem: createCheckListItem(),
		fileTree: createFileTree(),
	},
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		noteLink: noteLinkInlineSpec,
		tag: tagInlineSpec,
		user: userInlineSpec,
		person: personInlineSpec,
	},
});

export type EditorSchema = typeof editorSchema;
