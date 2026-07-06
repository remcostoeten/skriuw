import { flattenInlineChips } from "@/domain/notes/rich-document";
import type { EditorInstance } from "./editor-instance";

export async function blocksToMarkdown(editor: EditorInstance): Promise<string> {
	try {
		await Promise.resolve();
		const flattened = flattenInlineChips(editor.document);
		// biome-ignore lint/suspicious/noExplicitAny: blocksToMarkdownLossy accepts schema-shaped blocks
		const markdown = await editor.blocksToMarkdownLossy(flattened as any);
		return markdown;
	} catch {
		return "";
	}
}

export function inlineContentToPlainText(content: unknown): string {
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((node) => {
			if (!node || typeof node !== "object") {
				return "";
			}

			const inlineNode = node as {
				text?: unknown;
				content?: unknown;
				props?: { title?: unknown; name?: unknown };
			};

			if (typeof inlineNode.text === "string") {
				return inlineNode.text;
			}

			const nestedText = inlineContentToPlainText(inlineNode.content);
			if (nestedText) {
				return nestedText;
			}

			if (typeof inlineNode.props?.title === "string") {
				return inlineNode.props.title;
			}

			if (typeof inlineNode.props?.name === "string") {
				return inlineNode.props.name;
			}

			return "";
		})
		.join("");
}

export function blockToPlainText(block: unknown): string {
	if (!block || typeof block !== "object") return "";
	const node = block as { content?: unknown; children?: unknown };
	const own = inlineContentToPlainText(node.content);
	const childText = Array.isArray(node.children)
		? node.children.map(blockToPlainText).join("\n")
		: "";
	return `${own}\n${childText}`.replace(/\s+/g, " ").trim();
}

export function getFirstHeadingTitle(editor: EditorInstance): string {
	const firstHeading = editor.document?.find(
		(block: { type?: unknown }) => block?.type === "heading",
	);
	if (!firstHeading) {
		return "";
	}

	return inlineContentToPlainText((firstHeading as { content?: unknown }).content)
		.trim()
		.replace(/\s+/g, " ");
}
