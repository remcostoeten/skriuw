import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { noteLinkInlineSpec } from "./note-link-spec";
import { tagInlineSpec } from "./tag-spec";
import { userInlineSpec } from "./user-spec";
import { personInlineSpec } from "./person-spec";
import { createCheckListItem } from "../block-specs/checklist-item";
import { createDiagram } from "../block-specs/diagram";
import { createDrawing } from "../block-specs/drawing";
import { createFileTree } from "../block-specs/file-tree";
import { CodeBlock } from "../block-specs/CodeBlock";
import { markInlineSpec } from "./mark-spec";

const { codeBlock: _discarded, ...blockSpecsWithoutCodeBlock } = defaultBlockSpecs;

export const editorSchema = BlockNoteSchema.create({
	blockSpecs: {
		...blockSpecsWithoutCodeBlock,
		procode: CodeBlock(),
		checkListItem: createCheckListItem(),
		fileTree: createFileTree(),
		diagram: createDiagram(),
		drawing: createDrawing(),
	},
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		noteLink: noteLinkInlineSpec,
		tag: tagInlineSpec,
		user: userInlineSpec,
		person: personInlineSpec,
		mark: markInlineSpec,
	},
});

export type EditorSchema = typeof editorSchema;
