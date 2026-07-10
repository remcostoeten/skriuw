// ---------------------------------------------------------------------------
// rich-to-markdown.ts (mobile copy)
//
// Pure emitter: RichDocument (BlockNote JSON) -> markdown string. This is the
// Phase 4 dependency that lets the native read renderer mutate a note (e.g. a
// checkbox toggle) and persist it through updateNote({ content }), since the
// backend treats markdown as the source of truth and derives richContent.
//
// It intentionally mirrors the block/inline coverage of the read renderer
// (BlockView + InlineContent). Unknown block types degrade to their plain text
// so a round-trip never destroys content it does not understand.
//
// Will be REPLACED by @skriuw/domain's canonical emitter once Phase 0 lands;
// keep the output shape compatible with the web serializer.
// ---------------------------------------------------------------------------

import type {
	Block,
	InlineContent,
	InlineStyles,
	RichDocument,
	TableContent,
} from "@/domain/rich-document";

/** Emit a full document to markdown. Blocks are separated by blank lines,
 *  except tight list items which stay on adjacent lines. */
export function richToMarkdown(doc: RichDocument): string {
	const lines: string[] = [];
	emitBlocks(doc, 0, lines);
	// Collapse 3+ blank lines to a single blank line and trim trailing space.
	return lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]+$/gm, "")
		.trim();
}

function emitBlocks(blocks: Block[], depth: number, out: string[]) {
	let numberedCounter = 0;
	for (const block of blocks) {
		if (block.type === "numberedListItem") {
			numberedCounter += 1;
		} else {
			numberedCounter = 0;
		}
		emitBlock(block, depth, numberedCounter, out);
		if (block.children && block.children.length > 0) {
			emitBlocks(block.children, depth + 1, out);
		}
	}
}

function emitBlock(block: Block, depth: number, ordinal: number, out: string[]) {
	const indent = "  ".repeat(depth);
	const inline = () => inlineToMarkdown(block.content);

	switch (block.type) {
		case "heading": {
			const level = Math.min(Math.max(block.props?.level ?? 1, 1), 6);
			out.push(`${"#".repeat(level)} ${inline()}`, "");
			return;
		}
		case "paragraph":
			out.push(inline(), "");
			return;
		case "bulletListItem":
			out.push(`${indent}- ${inline()}`);
			return;
		case "numberedListItem":
			out.push(`${indent}${ordinal || 1}. ${inline()}`);
			return;
		case "checkListItem": {
			const mark = block.props?.checked ? "x" : " ";
			out.push(`${indent}- [${mark}] ${inline()}`);
			return;
		}
		case "quote":
			out.push(`> ${inline()}`, "");
			return;
		case "codeBlock":
		case "procode": {
			const lang = block.props?.language ? String(block.props.language) : "";
			out.push("```" + lang, inlinePlain(block.content), "```", "");
			return;
		}
		case "table":
			out.push(tableToMarkdown(block.content as TableContent), "");
			return;
		case "image": {
			const url = block.props?.url ?? "";
			const caption = block.props?.caption ?? "";
			if (url) out.push(`![${caption}](${url})`, "");
			else if (caption) out.push(caption, "");
			return;
		}
		case "diagram":
		case "fileTree": {
			// Preserve the source verbatim in a labeled fence so a round-trip is loss-free.
			out.push("```" + block.type, inlinePlain(block.content), "```", "");
			return;
		}
		default: {
			// Forward-compatible: keep whatever text we can read.
			const text = inline();
			if (text) out.push(text, "");
			return;
		}
	}
}

function inlineToMarkdown(content?: InlineContent[] | TableContent): string {
	if (!content || !Array.isArray(content)) return "";
	return content.map(inlineNodeToMarkdown).join("");
}

function inlineNodeToMarkdown(node: InlineContent): string {
	switch (node.type) {
		case "text":
			return applyStyles(node.text, node.styles);
		case "link":
			return `[${node.content.map((c) => applyStyles(c.text, c.styles)).join("")}](${node.href})`;
		case "noteLink": {
			const label = node.props.alias ?? node.props.title;
			return `[[${node.props.noteId}|${label}]]`;
		}
		case "tag":
			return `#${node.props.tag}`;
		case "person":
			return `$${node.props.name}`;
		case "user":
			return `@${node.props.username}`;
		default:
			return "";
	}
}

function applyStyles(text: string, styles?: InlineStyles): string {
	if (!styles || !text) return text;
	let out = text;
	if (styles.code) out = `\`${out}\``;
	if (styles.bold) out = `**${out}**`;
	if (styles.italic) out = `*${out}*`;
	if (styles.strike) out = `~~${out}~~`;
	return out;
}

function inlinePlain(content?: InlineContent[] | TableContent): string {
	if (!content || !Array.isArray(content)) return "";
	return content
		.map((n) =>
			n.type === "text"
				? n.text
				: n.type === "link"
					? n.content.map((c) => c.text).join("")
					: "",
		)
		.join("");
}

function tableToMarkdown(content: TableContent): string {
	if (!content || content.type !== "tableContent" || content.rows.length === 0) return "";
	const rows = content.rows.map(
		(row) =>
			"| " +
			row.cells
				.map((cell) => inlineToMarkdown(cell.content).replace(/\|/g, "\\|"))
				.join(" | ") +
			" |",
	);
	// Insert a header separator after the first row (GitHub-flavored markdown).
	const colCount = content.rows[0].cells.length;
	const separator = "| " + Array(colCount).fill("---").join(" | ") + " |";
	return [rows[0], separator, ...rows.slice(1)].join("\n");
}
