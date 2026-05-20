import type { Block, PartialBlock } from "@blocknote/core";
import { isFileTreeFence, normalizeFileTreeSource } from "@/shared/lib/file-tree";
import type { RichTextDocument } from "@/types/notes";

type InlineNode = {
	type: string;
	text?: string;
	href?: string;
	styles?: Record<string, unknown>;
	props?: Record<string, unknown>;
	content?: InlineNode[];
};

type InlineHit = {
	start: number;
	end: number;
	produce: (baseStyles: Record<string, unknown>) => InlineNode[];
};

const TAG_PATTERN = /(^|[\s([{])#([a-zA-Z][a-zA-Z0-9_-]{1,31})\b/g;
const WIKI_LINK_PATTERN = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;
const IMAGE_INLINE_PATTERN = /!\[([^\]\n]*?)\]\(([^)\n\s]+?)(?:\s+"([^"]*)")?\)/g;
const INLINE_LINK_PATTERN = /\[([^\]\n]+?)\]\(([^)\n\s]+?)(?:\s+"[^"]*")?\)/g;
const CODE_SPAN_PATTERN = /(?<!`)`([^`\n]+?)`(?!`)/g;
const BOLD_STAR_PATTERN = /\*\*((?:[^*\n]|\*(?!\*))+?)\*\*/g;
const BOLD_UNDERSCORE_PATTERN = /(^|[^_\w])__([^_\n]+?)__(?!\w)/g;
const HIGHLIGHT_PATTERN = /==([^=\n]+?)==/g;
const STRIKE_PATTERN = /~~([^~\n]+?)~~/g;
const ITALIC_STAR_PATTERN = /(^|[^*\w])\*((?:[^*\n]+?))\*(?!\*)/g;
const ITALIC_UNDERSCORE_PATTERN = /(^|[^_\w])_([^_\n]+?)_(?!\w)/g;

function findInlineHits(text: string): InlineHit[] {
	const hits: InlineHit[] = [];

	for (const match of text.matchAll(CODE_SPAN_PATTERN)) {
		const start = match.index ?? 0;
		const inner = match[1];
		hits.push({
			start,
			end: start + match[0].length,
			produce: (baseStyles) => [
				{ type: "text", text: inner, styles: { ...baseStyles, code: true } },
			],
		});
	}

	for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
		const title = match[1]?.trim();
		if (!title) continue;
		const start = match.index ?? 0;
		hits.push({
			start,
			end: start + match[0].length,
			produce: () => [{ type: "noteLink", props: { title } }],
		});
	}

	for (const match of text.matchAll(INLINE_LINK_PATTERN)) {
		const start = match.index ?? 0;
		const label = match[1];
		const href = match[2];
		if (!label || !href) continue;
		hits.push({
			start,
			end: start + match[0].length,
			produce: (baseStyles) => [
				{
					type: "link",
					href,
					content: parseStyledText(label, baseStyles),
				},
			],
		});
	}

	for (const match of text.matchAll(BOLD_STAR_PATTERN)) {
		const start = match.index ?? 0;
		const inner = match[1];
		hits.push({
			start,
			end: start + match[0].length,
			produce: (baseStyles) => parseInlineContent(inner, { ...baseStyles, bold: true }),
		});
	}

	for (const match of text.matchAll(BOLD_UNDERSCORE_PATTERN)) {
		const prefix = match[1] ?? "";
		const start = (match.index ?? 0) + prefix.length;
		const inner = match[2];
		hits.push({
			start,
			end: start + 4 + inner.length,
			produce: (baseStyles) => parseInlineContent(inner, { ...baseStyles, bold: true }),
		});
	}

	for (const match of text.matchAll(STRIKE_PATTERN)) {
		const start = match.index ?? 0;
		const inner = match[1];
		hits.push({
			start,
			end: start + match[0].length,
			produce: (baseStyles) => parseInlineContent(inner, { ...baseStyles, strike: true }),
		});
	}

	for (const match of text.matchAll(ITALIC_STAR_PATTERN)) {
		const prefix = match[1] ?? "";
		const start = (match.index ?? 0) + prefix.length;
		const inner = match[2];
		hits.push({
			start,
			end: start + 2 + inner.length,
			produce: (baseStyles) => parseInlineContent(inner, { ...baseStyles, italic: true }),
		});
	}

	for (const match of text.matchAll(ITALIC_UNDERSCORE_PATTERN)) {
		const prefix = match[1] ?? "";
		const start = (match.index ?? 0) + prefix.length;
		const inner = match[2];
		hits.push({
			start,
			end: start + 2 + inner.length,
			produce: (baseStyles) => parseInlineContent(inner, { ...baseStyles, italic: true }),
		});
	}

	for (const match of text.matchAll(TAG_PATTERN)) {
		const prefix = match[1] ?? "";
		const name = match[2]?.trim();
		if (!name) continue;
		const start = (match.index ?? 0) + prefix.length;
		hits.push({
			start,
			end: start + 1 + name.length,
			produce: () => [{ type: "tag", props: { name } }],
		});
	}

	hits.sort((left, right) => {
		if (left.start !== right.start) return left.start - right.start;
		return right.end - right.start - (left.end - left.start);
	});

	const filtered: InlineHit[] = [];
	let cursor = 0;
	for (const hit of hits) {
		if (hit.start < cursor) continue;
		filtered.push(hit);
		cursor = hit.end;
	}
	return filtered;
}

function parseStyledText(text: string, baseStyles: Record<string, unknown>): InlineNode[] {
	return parseInlineContent(text, baseStyles).filter((node) => node.type === "text");
}

export function parseInlineContent(
	text: string,
	baseStyles: Record<string, unknown> = {},
): InlineNode[] {
	if (!text) return [];
	const hits = findInlineHits(text);
	if (hits.length === 0) {
		return [{ type: "text", text, styles: baseStyles }];
	}

	const result: InlineNode[] = [];
	let cursor = 0;

	for (const hit of hits) {
		if (hit.start > cursor) {
			result.push({ type: "text", text: text.slice(cursor, hit.start), styles: baseStyles });
		}
		result.push(...hit.produce(baseStyles));
		cursor = hit.end;
	}

	if (cursor < text.length) {
		result.push({ type: "text", text: text.slice(cursor), styles: baseStyles });
	}

	return result;
}

function upgradeInlineNode(inline: InlineNode): InlineNode | InlineNode[] {
	if (inline.type === "text" && typeof inline.text === "string") {
		return parseInlineContent(inline.text, inline.styles ?? {});
	}
	if (inline.type === "link" && Array.isArray(inline.content)) {
		const upgraded = inline.content.flatMap((child) => {
			if (child.type === "text" && typeof child.text === "string") {
				return parseInlineContent(child.text, child.styles ?? {}).filter(
					(node) => node.type === "text",
				);
			}
			return [child];
		});
		return { ...inline, content: upgraded };
	}
	return inline;
}

function upgradeBlockContent(blocks: PartialBlock[]): PartialBlock[] {
	return blocks.map((block) => {
		const next: PartialBlock = { ...block };
		const content = block.content;
		const blockType = String(block.type ?? "");
		const blockProps = (block as { props?: Record<string, unknown> }).props;

		if (blockType === "fileTree") {
			const source = String(blockProps?.source ?? "");
			return {
				type: "fileTree",
				props: { source: normalizeFileTreeSource(source) },
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		if (blockType === "codeBlock") {
			const language = String(blockProps?.language ?? "");
			const source = getPlainBlockContent(content);
			if (isFileTreeFence(language, source)) {
				return {
					type: "fileTree",
					props: { source: normalizeFileTreeSource(source) },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any;
			}

			return {
				...next,
				content: source,
			};
		}

		if (typeof content === "string") {
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			next.content = parseInlineContent(content) as any;
		} else if (Array.isArray(content)) {
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			next.content = content.flatMap((inline: any) => {
				const upgraded = upgradeInlineNode(inline as InlineNode);
				return Array.isArray(upgraded) ? upgraded : [upgraded];
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			}) as any;
		}

		if (Array.isArray(block.children) && block.children.length > 0) {
			next.children = upgradeBlockContent(block.children as PartialBlock[]);
		}

		return next;
	});
}

export function flattenInlineChips(blocks: Block[] | PartialBlock[]): PartialBlock[] {
	return (blocks as PartialBlock[]).map((block) => {
		const blockType = String(block.type ?? "");
		const blockProps = (block as { props?: Record<string, unknown> }).props;

		if (blockType === "fileTree") {
			return {
				type: "codeBlock",
				props: { language: "filetree" },
				content: normalizeFileTreeSource(String(blockProps?.source ?? "")),
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		const next: PartialBlock = { ...block };
		const content = block.content;

		if (Array.isArray(content)) {
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			next.content = content.flatMap((inline: any) => {
				if (inline?.type === "noteLink") {
					const title = String(inline.props?.title ?? "").trim();
					if (!title) return [];
					return [{ type: "text", text: `[[${title}]]`, styles: {} }];
				}
				if (inline?.type === "tag") {
					const name = String(inline.props?.name ?? "").trim();
					if (!name) return [];
					return [{ type: "text", text: `#${name}`, styles: {} }];
				}
				return [inline];
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			}) as any;
		}

		if (Array.isArray(block.children) && block.children.length > 0) {
			next.children = flattenInlineChips(block.children as PartialBlock[]);
		}

		return next;
	});
}

function skipBlankLines(lines: string[], from: number): number {
	let j = from;
	while (j < lines.length && lines[j].trim() === "") j++;
	return j;
}

function parseTableRow(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|") || !trimmed.endsWith("|") || trimmed.length < 2) {
		return null;
	}
	return trimmed
		.slice(1, -1)
		.split("|")
		.map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
	const trimmed = line.trim();
	return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(trimmed);
}

const CODE_FENCE_OPEN_PATTERN = /^\s{0,3}```(.*)$/;
const CODE_FENCE_CLOSE_PATTERN = /^\s{0,3}```\s*$/;

function isHorizontalRule(line: string): boolean {
	const trimmed = line.trim();
	return /^(\*{3,}|-{3,}|_{3,})$/.test(trimmed);
}

function markdownContainsTable(markdown: string): boolean {
	const lines = markdown.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (!parseTableRow(lines[i])) continue;
		const separatorIdx = skipBlankLines(lines, i + 1);
		if (separatorIdx < lines.length && isTableSeparator(lines[separatorIdx])) {
			return true;
		}
	}
	return false;
}

function markdownContainsTaskList(markdown: string): boolean {
	return /^\s*[-*]\s+\[[ xX]\]\s+/m.test(markdown);
}

function richDocumentHasBlockType(blocks: RichTextDocument, type: string): boolean {
	return blocks.some((block) => {
		if (String(block.type ?? "") === type) {
			return true;
		}
		if (Array.isArray(block.children) && block.children.length > 0) {
			return richDocumentHasBlockType(block.children as RichTextDocument, type);
		}
		return false;
	});
}

function getPlainBlockContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === "string") {
					return item;
				}

				if (item && typeof item === "object" && "text" in item) {
					return String(item.text ?? "");
				}

				return "";
			})
			.join("");
	}

	return "";
}

export function markdownToRichDocument(markdown: string): RichTextDocument {
	const lines = markdown.split("\n");
	const blocks: PartialBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Table detection. Allow blank lines between header / separator / data rows
		// because BlockNote's lossy markdown serializer can emit tables with paragraph
		// gaps; without this tolerance the rows fall through to paragraph blocks.
		const headerCells = parseTableRow(line);
		if (headerCells) {
			const separatorIdx = skipBlankLines(lines, i + 1);
			if (separatorIdx < lines.length && isTableSeparator(lines[separatorIdx])) {
				const cellToInline = (cell: string): InlineNode[] => {
					const parsed = parseInlineContent(cell);
					return parsed.length > 0 ? parsed : [{ type: "text", text: "", styles: {} }];
				};
				const rows: { cells: InlineNode[][] }[] = [
					{ cells: headerCells.map(cellToInline) },
				];
				let j = separatorIdx + 1;
				while (j < lines.length) {
					const nextRowIdx = skipBlankLines(lines, j);
					if (nextRowIdx >= lines.length) {
						j = nextRowIdx;
						break;
					}
					const dataCells = parseTableRow(lines[nextRowIdx]);
					if (!dataCells) {
						j = nextRowIdx;
						break;
					}
					const normalized =
						dataCells.length < headerCells.length
							? [
									...dataCells,
									...Array(headerCells.length - dataCells.length).fill(""),
								]
							: dataCells.slice(0, headerCells.length);
					rows.push({ cells: normalized.map(cellToInline) });
					j = nextRowIdx + 1;
				}
				blocks.push({
					type: "table",
					content: {
						type: "tableContent",
						headerRows: 1,
						// biome-ignore lint/suspicious/noExplicitAny: tableContent rows accept inline arrays
						rows: rows as any,
					},
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any);
				i = j;
				continue;
			}
		}

		if (isHorizontalRule(line)) {
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			blocks.push({ type: "divider" } as any);
			i++;
			continue;
		}

		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
			blocks.push({
				type: "heading",
				props: { level },
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
				content: parseInlineContent(headingMatch[2]) as any,
			});
			i++;
			continue;
		}

		if (line.match(/^\s*[-*]\s+/)) {
			while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
				const taskMatch = lines[i].match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
				if (taskMatch) {
					blocks.push({
						type: "checkListItem",
						props: { checked: taskMatch[1].toLowerCase() === "x" },
						// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
						content: parseInlineContent(taskMatch[2]) as any,
					});
					i++;
					continue;
				}
				const text = lines[i].replace(/^\s*[-*]\s+/, "");
				blocks.push({
					type: "bulletListItem",
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
					content: parseInlineContent(text) as any,
				});
				i++;
			}
			continue;
		}

		if (line.match(/^\s*\d+\.\s+/)) {
			while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
				const text = lines[i].replace(/^\s*\d+\.\s+/, "");
				blocks.push({
					type: "numberedListItem",
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
					content: parseInlineContent(text) as any,
				});
				i++;
			}
			continue;
		}

		const fenceMatch = line.match(CODE_FENCE_OPEN_PATTERN);
		if (fenceMatch) {
			const language = fenceMatch[1].trim();
			i++;
			const codeLines: string[] = [];
			while (i < lines.length && !CODE_FENCE_CLOSE_PATTERN.test(lines[i])) {
				codeLines.push(lines[i]);
				i++;
			}
			const code = codeLines.join("\n");
			// Only step past the closing fence if we actually found one; an unclosed
			// fence has already pushed `i` to `lines.length`, and an extra increment
			// is just a defensive no-op we'd rather avoid.
			if (i < lines.length) i++;
			if (isFileTreeFence(language, code)) {
				blocks.push({
					type: "fileTree",
					props: { source: normalizeFileTreeSource(code) },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any);
				continue;
			}
			blocks.push({
				type: "codeBlock",
				props: { language: language || "plaintext" },
				content: code,
			});
			continue;
		}

		if (line.match(/^>\s?/)) {
			const quoteLines: string[] = [];
			while (i < lines.length && lines[i].match(/^>\s?/)) {
				quoteLines.push(lines[i].replace(/^>\s?/, ""));
				i++;
			}
			blocks.push({
				type: "quote",
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
				content: parseInlineContent(quoteLines.join(" ")) as any,
			});
			continue;
		}

		if (line.trim() === "") {
			i++;
			continue;
		}

		const paragraphLines: string[] = [line];
		i++;
		while (
			i < lines.length &&
			lines[i].trim() !== "" &&
			!lines[i].match(/^(#{1,6})\s+/) &&
			!lines[i].match(/^\s*[-*]\s+/) &&
			!lines[i].match(/^\s*\d+\.\s+/) &&
			!lines[i].startsWith("```") &&
			!lines[i].match(/^>\s?/) &&
			!isHorizontalRule(lines[i]) &&
			!(parseTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
		) {
			paragraphLines.push(lines[i]);
			i++;
		}
		blocks.push({
			type: "paragraph",
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			content: parseInlineContent(paragraphLines.join(" ")) as any,
		});
	}

	if (blocks.length === 0) {
		return [{ type: "paragraph", content: "" }];
	}

	return blocks as RichTextDocument;
}

export function resolveRichDocument(
	markdown: string,
	richContent: RichTextDocument | null | undefined,
): RichTextDocument {
	if (!richContent || richContent.length === 0) {
		return markdownToRichDocument(markdown);
	}

	// Older stored rich_content rows only preserved basic headings/lists/code/paragraphs.
	// When the markdown now includes richer constructs, prefer a fresh parse over stale blocks.
	if (markdownContainsTable(markdown) && !richDocumentHasBlockType(richContent, "table")) {
		return markdownToRichDocument(markdown);
	}

	if (
		markdownContainsTaskList(markdown) &&
		!richDocumentHasBlockType(richContent, "checkListItem")
	) {
		return markdownToRichDocument(markdown);
	}

	return richContent;
}

export function cloneRichDocument(document: Block[]): RichTextDocument {
	return JSON.parse(JSON.stringify(document)) as RichTextDocument;
}

export function upgradeRichDocumentChips(document: RichTextDocument): RichTextDocument {
	return upgradeBlockContent(document) as RichTextDocument;
}
