import type { Block, PartialBlock } from "@blocknote/core";
import { isFileTreeFence, normalizeFileTreeSource } from "@/shared/lib/file-tree";
import { isTagDetectionEnabled } from "@/domain/notes/tag-detection";
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

// Every pattern below requires one of these characters, so a plain text node
// (the overwhelming majority in an already-upgraded document) skips the whole
// nine-regex battery with one scan. This runs per text node on the editor
// mount and note-switch paths.
const INLINE_TRIGGER_PATTERN = /[`[*_~#]/;

function findInlineHits(text: string): InlineHit[] {
	if (!INLINE_TRIGGER_PATTERN.test(text)) return [];
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

	if (isTagDetectionEnabled()) {
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

const SIDEBAR_DRAG_JSON_PATTERN =
	/\{"type":"(?:file|folder)","id":"[0-9a-f-]{36}","parentId":(?:null|"[0-9a-f-]{36}")\}/g;

export function stripSidebarDragArtifacts(text: string): string {
	return text
		.replace(SIDEBAR_DRAG_JSON_PATTERN, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

function parseStyledText(text: string, baseStyles: Record<string, unknown>): InlineNode[] {
	return parseInlineContent(text, baseStyles).filter((node) => node.type === "text");
}

export function parseInlineContent(
	text: string,
	baseStyles: Record<string, unknown> = {},
): InlineNode[] {
	const cleaned = stripSidebarDragArtifacts(text);
	if (!cleaned) return [];
	const hits = findInlineHits(cleaned);
	if (hits.length === 0) {
		return [{ type: "text", text: cleaned, styles: baseStyles }];
	}

	const result: InlineNode[] = [];
	let cursor = 0;

	for (const hit of hits) {
		if (hit.start > cursor) {
			result.push({
				type: "text",
				text: cleaned.slice(cursor, hit.start),
				styles: baseStyles,
			});
		}
		result.push(...hit.produce(baseStyles));
		cursor = hit.end;
	}

	if (cursor < cleaned.length) {
		result.push({ type: "text", text: cleaned.slice(cursor), styles: baseStyles });
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

		if (blockType === "procode" || blockType === "codeBlock") {
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
				type: "procode",
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
				type: "procode",
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
				if (inline?.type === "user") {
					const name = String(inline.props?.name ?? "").trim();
					if (!name) return [];
					return [{ type: "text", text: `$${name}`, styles: {} }];
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

function isBlockNoteTableContent(content: unknown): boolean {
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return false;
	}
	return (content as { type?: string }).type === "tableContent";
}

function blockNeedsRichDocumentRepair(block: PartialBlock): boolean {
	const blockType = String(block.type ?? "");
	const content = block.content;

	if (blockType === "table" && !isBlockNoteTableContent(content)) {
		return true;
	}

	if (blockType === "procode" && Array.isArray(content)) {
		return true;
	}

	if (blockType === "codeBlock") {
		return true;
	}

	if (Array.isArray(block.children) && block.children.length > 0) {
		return (block.children as PartialBlock[]).some(blockNeedsRichDocumentRepair);
	}

	return false;
}

export function richDocumentNeedsRepair(document: RichTextDocument | null | undefined): boolean {
	if (!document?.length) {
		return false;
	}
	return document.some((block) => blockNeedsRichDocumentRepair(block as PartialBlock));
}

/** Builds a BlockNote-compatible table block from plain cell strings. */
export function buildTableBlock(headers: string[], rows: string[][]): PartialBlock {
	const cellToInline = (cell: string): InlineNode[] => {
		const parsed = parseInlineContent(cell);
		return parsed.length > 0 ? parsed : [{ type: "text", text: "", styles: {} }];
	};

	const tableRows: { cells: InlineNode[][] }[] = [
		{ cells: headers.map(cellToInline) },
		...rows.map((row) => {
			const normalized =
				row.length < headers.length
					? [...row, ...Array(headers.length - row.length).fill("")]
					: row.slice(0, headers.length);
			return { cells: normalized.map(cellToInline) };
		}),
	];

	return {
		type: "table",
		content: {
			type: "tableContent",
			headerRows: 1,
			// biome-ignore lint/suspicious/noExplicitAny: tableContent rows accept inline arrays
			rows: tableRows as any,
		},
		// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
	} as any;
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

/**
 * Local LLMs frequently wrap an entire markdown answer in a single fence
 * (often ```markdown or ```md) instead of using real heading/code-block
 * syntax at the top level — a side effect of being told "respond only with
 * markdown". Left as-is, the whole response is parsed as one literal code
 * block instead of headings/paragraphs/nested code blocks. Detected by an
 * explicit markdown/md language tag, or by the wrapped content containing
 * its own fence (a real single code-snippet answer never nests a fence).
 */
function unwrapOuterMarkdownFence(markdown: string): string {
	const trimmed = markdown.trim();
	const lines = trimmed.split("\n");
	if (lines.length < 2) return markdown;

	const openMatch = lines[0].match(CODE_FENCE_OPEN_PATTERN);
	if (!openMatch || !CODE_FENCE_CLOSE_PATTERN.test(lines[lines.length - 1])) return markdown;

	const inner = lines.slice(1, -1);
	const language = openMatch[1].trim().toLowerCase();
	const isMarkdownTag = language === "markdown" || language === "md";
	const hasNestedFence = inner.some((line) => CODE_FENCE_OPEN_PATTERN.test(line));
	if (!isMarkdownTag && !hasNestedFence) return markdown;

	return inner.join("\n");
}

export function markdownToRichDocument(markdown: string): RichTextDocument {
	const lines = unwrapOuterMarkdownFence(markdown).split("\n");
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
				type: "procode",
				props: { language: language || "plaintext" },
				content: code,
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any);
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

function inlineNodeToSearchableMarkdown(inline: unknown): string {
	if (!inline || typeof inline !== "object") {
		return "";
	}

	const node = inline as {
		type?: string;
		text?: string;
		props?: Record<string, unknown>;
		content?: unknown[];
	};

	if (node.type === "text") {
		return String(node.text ?? "");
	}

	if (node.type === "noteLink") {
		const title = String(node.props?.title ?? "").trim();
		return title ? `[[${title}]]` : "";
	}

	if (node.type === "tag") {
		const name = String(node.props?.name ?? "").trim();
		return name ? `#${name}` : "";
	}

	if (node.type === "user") {
		const name = String(node.props?.name ?? "").trim();
		return name ? `$${name}` : "";
	}

	if (node.type === "link" && Array.isArray(node.content)) {
		return node.content.map(inlineNodeToSearchableMarkdown).join("");
	}

	return "";
}

function blockToSearchableMarkdown(block: PartialBlock): string {
	const blockType = String(block.type ?? "paragraph");
	const blockProps = (block as { props?: Record<string, unknown> }).props;
	const content = block.content;

	let inlineText = "";
	if (typeof content === "string") {
		inlineText = content;
	} else if (Array.isArray(content)) {
		inlineText = content.map(inlineNodeToSearchableMarkdown).join("");
	}

	const childText = Array.isArray(block.children)
		? (block.children as PartialBlock[]).map(blockToSearchableMarkdown).filter(Boolean).join("\n")
		: "";

	if (blockType === "heading") {
		const level = Math.min(Math.max(Number(blockProps?.level ?? 1), 1), 6);
		const heading = `${"#".repeat(level)} ${inlineText}`.trim();
		return childText ? `${heading}\n${childText}` : heading;
	}

	if (blockType === "bulletListItem" || blockType === "numberedListItem") {
		const prefix = blockType === "numberedListItem" ? "1. " : "- ";
		const line = `${prefix}${inlineText}`.trim();
		return childText ? `${line}\n${childText}` : line;
	}

	if (blockType === "checkListItem") {
		const checked = blockProps?.checked ? "x" : " ";
		const line = `- [${checked}] ${inlineText}`.trim();
		return childText ? `${line}\n${childText}` : line;
	}

	if (blockType === "quote") {
		const line = `> ${inlineText}`.trim();
		return childText ? `${line}\n${childText}` : line;
	}

	if (blockType === "procode" || blockType === "fileTree") {
		return getPlainBlockContent(content);
	}

	if (blockType === "table") {
		if (isBlockNoteTableContent(content)) {
			const tableContent = content as {
				rows?: Array<{ cells?: Array<Array<{ text?: string } | string>> }>;
			};
			const lines = (tableContent.rows ?? []).map((row) => {
				const cells = (row.cells ?? []).map((cell) => {
					if (typeof cell === "string") return cell;
					if (Array.isArray(cell)) {
						return cell
							.map((inline) =>
								typeof inline === "string"
									? inline
									: String((inline as { text?: string }).text ?? ""),
							)
							.join("");
					}
					return "";
				});
				return `| ${cells.join(" | ")} |`;
			});
			if (lines.length >= 2) {
				const separator = `| ${lines[0]
					.slice(1, -1)
					.split("|")
					.map(() => "---")
					.join(" | ")} |`;
				return [lines[0], separator, ...lines.slice(1)].join("\n");
			}
		}

		if (Array.isArray(content)) {
			return content
				.map((inline) => inlineNodeToSearchableMarkdown(inline))
				.filter(Boolean)
				.join("\n");
		}
	}

	const lines = [inlineText, childText].filter(Boolean);
	return lines.join("\n");
}

/** Markdown-shaped text for link/tag search when `content` is empty but rich blocks exist. */
export function richDocumentToSearchableMarkdown(
	document: RichTextDocument | null | undefined,
): string {
	if (!document?.length) {
		return "";
	}

	return document
		.map((block) => blockToSearchableMarkdown(block as PartialBlock))
		.filter(Boolean)
		.join("\n\n");
}

function collectInlineUsers(content: unknown, acc: Map<string, string>): void {
	if (!Array.isArray(content)) {
		return;
	}

	for (const inline of content) {
		if (!inline || typeof inline !== "object") {
			continue;
		}

		const node = inline as { type?: string; props?: Record<string, unknown>; content?: unknown };
		if (node.type === "user") {
			const name = String(node.props?.name ?? "").trim();
			if (name) {
				acc.set(name.toLowerCase(), name);
			}
			continue;
		}

		collectInlineUsers(node.content, acc);
	}
}

/** Names of every `$user` chip actually present in a rich document (not prose `$word` text). */
export function extractRichDocumentUsers(
	document: RichTextDocument | null | undefined,
): string[] {
	if (!document?.length) {
		return [];
	}

	const acc = new Map<string, string>();
	const walk = (blocks: PartialBlock[]) => {
		for (const block of blocks) {
			collectInlineUsers(block.content, acc);
			if (Array.isArray(block.children)) {
				walk(block.children as PartialBlock[]);
			}
		}
	};
	walk(document as PartialBlock[]);

	return [...acc.values()].toSorted((left, right) => left.localeCompare(right));
}

function collectInlinePersonIds(content: unknown, acc: Set<string>): void {
	if (!Array.isArray(content)) {
		return;
	}

	for (const inline of content) {
		if (!inline || typeof inline !== "object") {
			continue;
		}

		const node = inline as { type?: string; props?: Record<string, unknown>; content?: unknown };
		if (node.type === "person") {
			const id = String(node.props?.id ?? "").trim();
			if (id) {
				acc.add(id);
			}
			continue;
		}

		collectInlinePersonIds(node.content, acc);
	}
}

/** Ids of every `$person` chip present in a rich document. */
export function extractRichDocumentPersonIds(
	document: RichTextDocument | null | undefined,
): string[] {
	if (!document?.length) {
		return [];
	}

	const acc = new Set<string>();
	const walk = (blocks: PartialBlock[]) => {
		for (const block of blocks) {
			collectInlinePersonIds(block.content, acc);
			if (Array.isArray(block.children)) {
				walk(block.children as PartialBlock[]);
			}
		}
	};
	walk(document as PartialBlock[]);

	return [...acc].toSorted((left, right) => left.localeCompare(right));
}

export function resolveRichDocument(
	markdown: string,
	richContent: RichTextDocument | null | undefined,
): RichTextDocument {
	if (!richContent || richContent.length === 0) {
		return markdownToRichDocument(markdown);
	}

	// Seed bundles and legacy imports may store table/code blocks in a shape BlockNote rejects.
	if (richDocumentNeedsRepair(richContent)) {
		const repaired = markdown.trim() ? markdownToRichDocument(markdown) : richContent;
		return richDocumentNeedsRepair(repaired) ? markdownToRichDocument(markdown) : repaired;
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

/**
 * Canonical comparison key for a rich document. Postgres stores `rich_content`
 * as JSONB, which rewrites object key order, so a saved note echoed back by the
 * server never `JSON.stringify`-matches the editor's in-memory snapshot even
 * when the documents are identical. Sorting keys recursively makes the key
 * insensitive to that reordering.
 */
export function richDocumentKey(document: RichTextDocument | null | undefined): string {
	return stableStringify(document ?? []);
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
		return `{${entries
			.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

export function upgradeRichDocumentChips(document: RichTextDocument): RichTextDocument {
	return upgradeBlockContent(document) as RichTextDocument;
}
