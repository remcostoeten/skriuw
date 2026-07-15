import { isDiagramFence, normalizeDiagramSource } from "@/shared/lib/diagram";
import { isFileTreeFence, normalizeFileTreeSource } from "@/shared/lib/file-tree";
import { isDrawingFence, normalizeDrawingScene } from "@/shared/lib/drawing";
import { isTagDetectionEnabled } from "@/domain/notes/tag-detection";
import type { RichTextBlock, RichTextDocument } from "@/types/notes";

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
// Bare `$name` typed as plain text (mobile, plain mode, or typing past the
// mention menu). Produces an id-less person chip; the id form below stays the
// durable reference, so this only upgrades text that never became a chip.
const BARE_PERSON_PATTERN = /(^|[\s([{])\$([a-zA-Z][a-zA-Z0-9_-]{0,31})\b/g;
const WIKI_LINK_PATTERN = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;
// The markdown form of a `$person` chip: `$[Name](person://id)`. The id is the
// durable reference (names resolve live from the People store); the label is a
// cached fallback. Mirrors `[label](note://id)` so person mentions survive
// markdown round-trips instead of degrading to plain `$Name` text.
export const PERSON_LINK_PATTERN = /\$\[([^\]\n]*?)\]\(person:\/\/([^)\n\s]+?)\)/g;
const MARK_LINK_PATTERN =
	/\[([^\]\n]+?)\]\(mark:\/\/([a-z]+)\/([^/\s)]+)\/([^/\s)]+)(?:\/([a-z]+))?(?:\/([^\s)]+))?\)/g;
const INLINE_LINK_PATTERN = /\[([^\]\n]+?)\]\(([^)\n\s]+?)(?:\s+"[^"]*")?\)/g;
const CODE_SPAN_PATTERN = /(?<!`)`([^`\n]+?)`(?!`)/g;
const BOLD_STAR_PATTERN = /\*\*((?:[^*\n]|\*(?!\*))+?)\*\*/g;
const BOLD_UNDERSCORE_PATTERN = /(^|[^_\w])__([^_\n]+?)__(?!\w)/g;
const STRIKE_PATTERN = /~~([^~\n]+?)~~/g;
const ITALIC_STAR_PATTERN = /(^|[^*\w])\*((?:[^*\n]+?))\*(?!\*)/g;
const ITALIC_UNDERSCORE_PATTERN = /(^|[^_\w])_([^_\n]+?)_(?!\w)/g;

// Every pattern below requires one of these characters, so a plain text node
// (the overwhelming majority in an already-upgraded document) skips the whole
// nine-regex battery with one scan. This runs per text node on the editor
// mount and note-switch paths.
const INLINE_TRIGGER_PATTERN = /[`[*_~#$]/;

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

	for (const match of text.matchAll(PERSON_LINK_PATTERN)) {
		const name = match[1]?.trim() ?? "";
		const id = match[2]?.trim();
		if (!id) continue;
		const start = match.index ?? 0;
		hits.push({
			start,
			end: start + match[0].length,
			produce: () => [{ type: "person", props: { id, name } }],
		});
	}

	if (isTagDetectionEnabled()) {
		for (const match of text.matchAll(BARE_PERSON_PATTERN)) {
			const prefix = match[1] ?? "";
			const name = match[2]?.trim();
			if (!name) continue;
			const start = (match.index ?? 0) + prefix.length;
			hits.push({
				start,
				end: start + 1 + name.length,
				produce: () => [{ type: "person", props: { id: "", name } }],
			});
		}
	}

	for (const match of text.matchAll(MARK_LINK_PATTERN)) {
		const label = match[1]?.trim();
		const kind = match[2]?.trim();
		const id = match[3]?.trim();
		if (!label || !kind || !id) continue;
		let value = label;
		try {
			value = decodeURIComponent(match[4]);
		} catch {
			// Keep readable label when imported metadata is malformed.
		}
		const color =
			match[5] === "green" || match[5] === "blue" || match[5] === "pink"
				? match[5]
				: "yellow";
		let annotationLabel = "";
		try {
			annotationLabel = decodeURIComponent(match[6] ?? "");
		} catch {
			// Omit malformed optional labels; visible text remains usable.
		}
		const start = match.index ?? 0;
		hits.push({
			start,
			end: start + match[0].length,
			produce: () => [
				{
					type: "mark",
					props: { id, kind, text: label, value, color, label: annotationLabel },
				},
			],
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
	return parseInlineContent(text, baseStyles).flatMap((node) => {
		if (node.type === "text") return [node];
		const chipText = inlineChipToText(node.type, node.props);
		if (!chipText) return [];
		return [{ type: "text", text: chipText, styles: baseStyles }];
	});
}

export function parseInlineContent(
	text: string,
	baseStyles: Record<string, unknown> = {},
): InlineNode[] {
	return parseInlineNodes(stripSidebarDragArtifacts(text), baseStyles);
}

/**
 * Parses inline syntax without reflowing whitespace. Existing inline text
 * nodes carry meaningful boundary spaces next to chips and styled runs, so
 * the upgrade path must never trim them — trimming here is what used to glue
 * `de #date dat` into `de#datedat` on every editor load.
 */
function parseUpgradedInlineText(text: string, baseStyles: Record<string, unknown>): InlineNode[] {
	return parseInlineNodes(text.replace(SIDEBAR_DRAG_JSON_PATTERN, ""), baseStyles);
}

function parseInlineNodes(cleaned: string, baseStyles: Record<string, unknown>): InlineNode[] {
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
		return parseUpgradedInlineText(inline.text, inline.styles ?? {});
	}
	if (inline.type === "link" && Array.isArray(inline.content)) {
		const upgraded = inline.content.flatMap((child) => {
			if (child.type === "text" && typeof child.text === "string") {
				// Chips cannot live inside a link, so anything parsed into a chip
				// is demoted back to its typed syntax instead of being dropped.
				return parseUpgradedInlineText(child.text, child.styles ?? {}).flatMap((node) => {
					if (node.type === "text") return [node];
					const chipText = inlineChipToText(node.type, node.props);
					if (!chipText) return [];
					return [{ type: "text", text: chipText, styles: child.styles ?? {} }];
				});
			}
			return [child];
		});
		return { ...inline, content: upgraded };
	}
	return inline;
}

function upgradeBlockContent(blocks: RichTextDocument): RichTextDocument {
	return blocks.map((block) => {
		const next: RichTextBlock = { ...block };
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

		if (blockType === "diagram") {
			const source = String(blockProps?.source ?? "");
			return {
				type: "diagram",
				props: { source: normalizeDiagramSource(source) },
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		if (blockType === "drawing") {
			return {
				type: "drawing",
				props: {
					scene: normalizeDrawingScene(String(blockProps?.scene ?? "")),
					...(typeof blockProps?.height === "number"
						? { height: blockProps.height }
						: {}),
				},
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		if (blockType === "procode" || blockType === "codeBlock") {
			const language = String(blockProps?.language ?? "");
			const source = getPlainBlockContent(content);
			if (isDiagramFence(language)) {
				return {
					type: "diagram",
					props: { source: normalizeDiagramSource(source) },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any;
			}
			if (isFileTreeFence(language, source)) {
				return {
					type: "fileTree",
					props: { source: normalizeFileTreeSource(source) },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any;
			}
			if (isDrawingFence(language)) {
				return {
					type: "drawing",
					props: { scene: normalizeDrawingScene(source) },
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
			next.children = upgradeBlockContent(block.children as RichTextDocument);
		}

		return next;
	});
}

/**
 * Serializes a `person` chip's props to its markdown form `$[Name](person://id)`.
 * The cached name is only a display fallback, so characters that would break
 * the link syntax are dropped from the label. Returns `$Name` when the chip has
 * no id (nothing durable to reference) and `""` when it has neither.
 */
function personChipToMarkdown(props: Record<string, unknown> | undefined): string {
	const id = String(props?.id ?? "").trim();
	const name = String(props?.name ?? "")
		.replace(/[[\]\n]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!id) return name ? `$${name}` : "";
	return `$[${name}](person://${id})`;
}

function markChipToMarkdown(props: Record<string, unknown> | undefined): string {
	const id = String(props?.id ?? "").trim();
	const kind = String(props?.kind ?? "reference").trim();
	const text = String(props?.text ?? "")
		.replace(/[[\]\n]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const value = encodeURIComponent(String(props?.value ?? text));
	const color = ["yellow", "green", "blue", "pink"].includes(String(props?.color))
		? String(props?.color)
		: "yellow";
	const label = String(props?.label ?? "").trim();
	if (!text || !id) return text;
	return `[${text}](mark://${kind}/${id}/${value}/${color}${label ? `/${encodeURIComponent(label)}` : ""})`;
}

/**
 * Textual syntax for an inline chip node (`#tag`, `$name`, `[[title]]`, …).
 * Returns `null` for non-chip inline content and `""` for a chip with nothing
 * durable to serialize, so callers can distinguish passthrough from drop.
 */
export function inlineChipToText(
	type: string,
	props: Record<string, unknown> | undefined,
): string | null {
	if (type === "noteLink") {
		const title = String(props?.title ?? "").trim();
		return title ? `[[${title}]]` : "";
	}
	if (type === "tag") {
		const name = String(props?.name ?? "").trim();
		return name ? `#${name}` : "";
	}
	if (type === "user") {
		const name = String(props?.name ?? "").trim();
		return name ? `$${name}` : "";
	}
	if (type === "person") {
		return personChipToMarkdown(props);
	}
	if (type === "mark") {
		return markChipToMarkdown(props);
	}
	return null;
}

export function flattenInlineChips(blocks: RichTextDocument): RichTextDocument {
	return (blocks as RichTextDocument).map((block) => {
		const blockType = String(block.type ?? "");
		const blockProps = (block as { props?: Record<string, unknown> }).props;

		if (blockType === "diagram") {
			return {
				type: "procode",
				props: { language: "mermaid" },
				content: normalizeDiagramSource(String(blockProps?.source ?? "")),
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		if (blockType === "drawing") {
			return {
				type: "procode",
				props: { language: "excalidraw" },
				content: String(blockProps?.scene ?? ""),
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		if (blockType === "fileTree") {
			return {
				type: "procode",
				props: { language: "filetree" },
				content: normalizeFileTreeSource(String(blockProps?.source ?? "")),
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any;
		}

		const next: RichTextBlock = { ...block };
		const content = block.content;

		if (Array.isArray(content)) {
			// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			next.content = content.flatMap((inline: any) => {
				const chipText = inlineChipToText(String(inline?.type ?? ""), inline?.props);
				if (chipText === null) return [inline];
				if (!chipText) return [];
				return [{ type: "text", text: chipText, styles: {} }];
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
			}) as any;
		}

		if (Array.isArray(block.children) && block.children.length > 0) {
			next.children = flattenInlineChips(block.children as RichTextDocument);
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

/**
 * Every block type the editor schema can render (see `editor/components/
 * inline-specs/schema.ts`). Stored `rich_content` can name a type this build has
 * no spec for — a `drawing` block written on a feature branch, a block removed
 * since, a document from a newer client — and BlockNote does not degrade there:
 * it looks the type up in the ProseMirror schema, gets `undefined`, and throws
 * out of `useCreateBlockNote`, taking the whole page down with it. So an
 * unrecognized type counts as damage and sends the document back through the
 * markdown parser, which only ever emits types in this set.
 */
const SUPPORTED_BLOCK_TYPES = new Set([
	"paragraph",
	"heading",
	"quote",
	"bulletListItem",
	"numberedListItem",
	"checkListItem",
	"toggleListItem",
	"table",
	"image",
	"video",
	"audio",
	"file",
	"divider",
	"procode",
	"fileTree",
	"diagram",
	"drawing",
]);

function blockNeedsRichDocumentRepair(block: RichTextBlock): boolean {
	const blockType = String(block.type ?? "");
	const content = block.content;

	if (!SUPPORTED_BLOCK_TYPES.has(blockType)) {
		return true;
	}

	if (blockType === "table" && !isBlockNoteTableContent(content)) {
		return true;
	}

	if (blockType === "procode" && Array.isArray(content)) {
		return true;
	}

	if (Array.isArray(block.children) && block.children.length > 0) {
		return (block.children as RichTextDocument).some(blockNeedsRichDocumentRepair);
	}

	return false;
}

export function richDocumentNeedsRepair(document: RichTextDocument | null | undefined): boolean {
	if (!document?.length) {
		return false;
	}
	return document.some((block) => blockNeedsRichDocumentRepair(block as RichTextBlock));
}

/** Builds a BlockNote-compatible table block from plain cell strings. */
export function buildTableBlock(headers: string[], rows: string[][]): RichTextBlock {
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

/** Stamp a stable `id` on every block (recursively) that lacks one. Blocks
 *  parsed from markdown are id-less PartialBlocks; on web BlockNote backfills
 *  ids when it hydrates the editor, but the raw JSON persisted server-side and
 *  consumed by non-BlockNote renderers (the native app) never gets them — an
 *  id-less block breaks list virtualization keyed on `block.id`.
 *
 *  Ids are derived deterministically from document position (not random), so
 *  re-deriving the same markdown yields byte-identical richContent. That keeps
 *  buildNoteVersionContentHash stable and version dedup working for clients
 *  that persist markdown only (the native app) rather than a hydrated doc. */
function assignBlockIds(blocks: RichTextDocument): RichTextDocument {
	let counter = 0;
	function walk(list: RichTextDocument): RichTextDocument {
		return list.map((block) => {
			const next = block.id
				? { ...block }
				: { ...block, id: `md-${(counter++).toString(36)}` };
			const children = (next as { children?: RichTextDocument }).children;
			if (children && children.length > 0) {
				next.children = walk(children);
			}
			return next;
		});
	}
	return walk(blocks);
}

export function markdownToRichDocument(markdown: string): RichTextDocument {
	const lines = unwrapOuterMarkdownFence(markdown).split("\n");
	const blocks: RichTextDocument = [];
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
			if (isDiagramFence(language)) {
				blocks.push({
					type: "diagram",
					props: { source: normalizeDiagramSource(code) },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any);
				continue;
			}
			if (isFileTreeFence(language, code)) {
				blocks.push({
					type: "fileTree",
					props: { source: normalizeFileTreeSource(code) },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any);
				continue;
			}
			if (isDrawingFence(language)) {
				blocks.push({
					type: "drawing",
					props: { scene: normalizeDrawingScene(code) },
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
		return assignBlockIds([{ type: "paragraph", content: "" }]) as RichTextDocument;
	}

	return assignBlockIds(blocks) as RichTextDocument;
}

function inlineNodeToSearchableMarkdown(inline: unknown): string {
	if (!inline || typeof inline !== "object") {
		return "";
	}

	const node = inline as {
		type?: string;
		text?: string;
		href?: string;
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

	if (node.type === "person") {
		return personChipToMarkdown(node.props);
	}

	if (node.type === "mark") {
		return markChipToMarkdown(node.props);
	}

	if (node.type === "link" && Array.isArray(node.content)) {
		const label = node.content.map(inlineNodeToSearchableMarkdown).join("");
		const href = typeof node.href === "string" ? node.href.trim() : "";
		if (label && href.startsWith("note://")) {
			return `[${label}](${href})`;
		}
		return label;
	}

	return "";
}

function blockToSearchableMarkdown(block: RichTextBlock): string {
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
		? (block.children as RichTextDocument)
				.flatMap((child) => {
					const text = blockToSearchableMarkdown(child);
					return text ? [text] : [];
				})
				.join("\n")
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

	if (blockType === "diagram") {
		return String(blockProps?.source ?? "");
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
				.flatMap((inline) => {
					const text = inlineNodeToSearchableMarkdown(inline);
					return text ? [text] : [];
				})
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
		.flatMap((block) => {
			const text = blockToSearchableMarkdown(block as RichTextBlock);
			return text ? [text] : [];
		})
		.join("\n\n");
}

function collectInlinePersonIds(content: unknown, acc: Set<string>): void {
	if (!Array.isArray(content)) {
		return;
	}

	for (const inline of content) {
		if (!inline || typeof inline !== "object") {
			continue;
		}

		const node = inline as {
			type?: string;
			props?: Record<string, unknown>;
			content?: unknown;
		};
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
	const walk = (blocks: RichTextDocument) => {
		for (const block of blocks) {
			collectInlinePersonIds(block.content, acc);
			if (Array.isArray(block.children)) {
				walk(block.children as RichTextDocument);
			}
		}
	};
	walk(document as RichTextDocument);

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

export function cloneRichDocument(document: RichTextDocument): RichTextDocument {
	try {
		return structuredClone(document) as RichTextDocument;
	} catch (err) {
		console.error("[cloneRichDocument] structuredClone failed, falling back to JSON:", err);
		return JSON.parse(JSON.stringify(document)) as RichTextDocument;
	}
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
