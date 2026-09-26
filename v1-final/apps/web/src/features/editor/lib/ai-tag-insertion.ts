import { markdownToRichDocument } from "@/domain/notes/rich-document";

type EditorBlock = {
	id: string;
	type?: string;
};

type InsertableEditor = {
	document: EditorBlock[];
	insertBlocks: (
		blocks: unknown[],
		reference: EditorBlock,
		position: "before" | "after",
	) => {
		id: string;
	}[];
};

export function insertMarkdownBelowHeading(editor: InsertableEditor, markdown: string): string[] {
	const blocks = markdownToRichDocument(markdown);
	if (blocks.length === 0) return [];

	const heading = editor.document.find((block) => block.type === "heading");
	const reference = heading ?? editor.document[editor.document.length - 1];
	if (!reference) return [];

	const inserted = editor.insertBlocks(blocks as unknown[], reference, "after");
	return inserted.map((block) => block.id);
}
