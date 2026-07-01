import type { NoteFile, RichTextDocument } from "@/domain/notes/models";
import { TAG_PATTERN } from "@/domain/notes/note-links";
import type { NoteProperty } from "@/domain/notes/properties";
import { normalizeStoredTagEntry, normalizeTagName } from "@/domain/tags/normalize";

// Pure chip-rewrite engine: renames/merges/deletes tag and person chips inside
// a note's rich content, markdown body, and tags[] without any DB or React
// imports, so all three backends (server action, guest IndexedDB, tauri) can
// run the exact same propagation.

type InlineNode = {
	type?: string;
	text?: string;
	props?: Record<string, unknown>;
	content?: unknown;
	styles?: Record<string, unknown>;
	[key: string]: unknown;
};

type InlineTransform = (node: InlineNode) => InlineNode[] | null;

export type NoteChipPatch = {
	content?: string;
	richContent?: RichTextDocument;
	tags?: string[];
	properties?: NoteProperty[];
};

const CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g;

function transformInlineArray(
	content: unknown[],
	transform: InlineTransform,
): { value: unknown[]; changed: boolean } {
	let changed = false;
	const next: unknown[] = [];

	for (const item of content) {
		if (!item || typeof item !== "object") {
			next.push(item);
			continue;
		}

		const node = item as InlineNode;
		const replacement = transform(node);
		if (replacement) {
			changed = true;
			next.push(...replacement);
			continue;
		}

		if (Array.isArray(node.content)) {
			const inner = transformInlineArray(node.content, transform);
			if (inner.changed) {
				changed = true;
				next.push({ ...node, content: inner.value });
				continue;
			}
		}

		next.push(node);
	}

	return { value: changed ? next : content, changed };
}

function transformBlockContent(
	content: unknown,
	transform: InlineTransform,
): { value: unknown; changed: boolean } {
	if (Array.isArray(content)) {
		return transformInlineArray(content, transform);
	}

	// Table blocks: content = { type: "tableContent", rows: [{ cells: [...] }] }
	// where each cell is either an inline array or { content: inline[] }.
	if (content && typeof content === "object" && "rows" in content) {
		const table = content as { rows?: unknown };
		if (!Array.isArray(table.rows)) {
			return { value: content, changed: false };
		}

		let changed = false;
		const rows = table.rows.map((row) => {
			if (!row || typeof row !== "object" || !Array.isArray((row as { cells?: unknown }).cells)) {
				return row;
			}
			const rowRecord = row as { cells: unknown[] };
			let rowChanged = false;
			const cells = rowRecord.cells.map((cell) => {
				if (Array.isArray(cell)) {
					const result = transformInlineArray(cell, transform);
					if (result.changed) rowChanged = true;
					return result.value;
				}
				if (cell && typeof cell === "object" && Array.isArray((cell as InlineNode).content)) {
					const cellNode = cell as InlineNode;
					const result = transformInlineArray(cellNode.content as unknown[], transform);
					if (result.changed) {
						rowChanged = true;
						return { ...cellNode, content: result.value };
					}
				}
				return cell;
			});
			if (rowChanged) {
				changed = true;
				return { ...rowRecord, cells };
			}
			return row;
		});

		return { value: changed ? { ...(content as object), rows } : content, changed };
	}

	return { value: content, changed: false };
}

/** Applies `transform` to every inline node of a rich document, immutably. */
export function rewriteRichDocument(
	document: RichTextDocument | null | undefined,
	transform: InlineTransform,
): { document: RichTextDocument; changed: boolean } {
	if (!document?.length) {
		return { document: document ?? [], changed: false };
	}

	let changed = false;

	function walkBlocks(blocks: unknown[]): unknown[] {
		let blocksChanged = false;
		const next = blocks.map((block) => {
			if (!block || typeof block !== "object") return block;
			const blockRecord = block as InlineNode & { children?: unknown };

			const content = transformBlockContent(blockRecord.content, transform);
			const children = Array.isArray(blockRecord.children)
				? walkBlocks(blockRecord.children)
				: blockRecord.children;
			const childrenChanged = children !== blockRecord.children;

			if (!content.changed && !childrenChanged) return block;
			blocksChanged = true;
			return { ...blockRecord, content: content.value, children };
		});

		if (!blocksChanged) return blocks;
		changed = true;
		return next;
	}

	const result = walkBlocks(document as unknown[]);
	return { document: (changed ? result : document) as RichTextDocument, changed };
}

function tagChipMatches(node: InlineNode, from: string): boolean {
	return node.type === "tag" && normalizeTagName(String(node.props?.name ?? "")) === from;
}

function tagChipTransform(from: string, to: string | null): InlineTransform {
	return (node) => {
		if (!tagChipMatches(node, from)) return null;
		if (to === null) {
			const text = normalizeTagName(String(node.props?.name ?? ""));
			return text ? [{ type: "text", text, styles: {} }] : [];
		}
		return [{ ...node, props: { ...node.props, name: to } }];
	};
}

export type PersonChipRewrite = {
	fromId: string;
	// null → remove the chip, leaving the person's name as plain text.
	toId: string | null;
	toName?: string;
	removalText?: string;
};

function personChipTransform(rewrite: PersonChipRewrite): InlineTransform {
	return (node) => {
		if (node.type !== "person" || String(node.props?.id ?? "") !== rewrite.fromId) {
			return null;
		}
		if (rewrite.toId === null) {
			const text = rewrite.removalText ?? String(node.props?.name ?? "");
			return text ? [{ type: "text", text, styles: {} }] : [];
		}
		return [
			{
				...node,
				props: {
					...node.props,
					id: rewrite.toId,
					name: rewrite.toName ?? String(node.props?.name ?? ""),
				},
			},
		];
	};
}

function markdownTagMatches(token: string, from: string): boolean {
	return token.toLowerCase() === from || normalizeTagName(token) === from;
}

/**
 * Rewrites `#tag` tokens in a markdown body outside code fences and inline
 * code, using the same tokenizer the tag extractor uses. `to === null` drops
 * the `#`, leaving the bare word in the prose.
 */
export function rewriteMarkdownTags(
	content: string,
	from: string,
	to: string | null,
): { content: string; changed: boolean } {
	if (!content) {
		return { content, changed: false };
	}

	let changed = false;
	const tagPattern = new RegExp(TAG_PATTERN.source, TAG_PATTERN.flags);
	const segments = content.split(CODE_SEGMENT_PATTERN);
	const rewritten = segments
		.map((segment, index) => {
			if (index % 2 === 1) return segment;
			return segment.replace(tagPattern, (match, prefix: string, token: string) => {
				if (!markdownTagMatches(token, from)) return match;
				changed = true;
				return to === null ? `${prefix}${token}` : `${prefix}#${to}`;
			});
		})
		.join("");

	return { content: changed ? rewritten : content, changed };
}

function rewriteTagsField(
	tags: string[] | undefined,
	from: string,
	to: string | null,
): { tags: string[]; changed: boolean } {
	if (!tags?.length) {
		return { tags: tags ?? [], changed: false };
	}

	let changed = false;
	const seen = new Set<string>();
	const next: string[] = [];

	for (const entry of tags) {
		const matches =
			normalizeStoredTagEntry(entry) === from || normalizeTagName(entry) === from;
		const value = matches ? to : entry;
		if (matches) changed = true;
		if (value === null) continue;
		const key = normalizeStoredTagEntry(value);
		if (seen.has(key)) {
			changed = true;
			continue;
		}
		seen.add(key);
		next.push(value);
	}

	return { tags: changed ? next : tags, changed };
}

/**
 * Full tag rename/merge/delete over one note. `from`/`to` are normalized tag
 * labels as persisted on NoteLink rows; `to === null` deletes the tag.
 * Returns only the changed fields, or null when the note is untouched.
 */
export function rewriteNoteForTag(
	note: Pick<NoteFile, "content" | "richContent" | "tags">,
	from: string,
	to: string | null,
): NoteChipPatch | null {
	const markdown = rewriteMarkdownTags(note.content ?? "", from, to);
	const rich = rewriteRichDocument(note.richContent, tagChipTransform(from, to));
	const tags = rewriteTagsField(note.tags, from, to);

	if (!markdown.changed && !rich.changed && !tags.changed) {
		return null;
	}

	const patch: NoteChipPatch = {};
	if (markdown.changed) patch.content = markdown.content;
	if (rich.changed) patch.richContent = rich.document;
	if (tags.changed) patch.tags = tags.tags;
	return patch;
}

/**
 * Repoints or removes a person id inside person-type note properties
 * (Owner/Attendees fields store arrays of person ids).
 */
export function rewritePersonProperties(
	properties: NoteProperty[] | undefined,
	rewrite: Pick<PersonChipRewrite, "fromId" | "toId">,
): { properties: NoteProperty[]; changed: boolean } {
	if (!properties?.length) {
		return { properties: properties ?? [], changed: false };
	}

	let changed = false;
	const next = properties.map((property) => {
		if (property.type !== "person" || !Array.isArray(property.value)) {
			return property;
		}
		const ids = property.value.filter((entry): entry is string => typeof entry === "string");
		if (!ids.includes(rewrite.fromId)) {
			return property;
		}
		changed = true;
		const replaced = ids
			.map((id) => (id === rewrite.fromId ? rewrite.toId : id))
			.filter((id): id is string => id !== null);
		return { ...property, value: [...new Set(replaced)] };
	});

	return { properties: changed ? next : properties, changed };
}

/**
 * Person merge (`toId` set) or delete (`toId === null`) over one note's rich
 * content and person-type properties. Person chips are id-keyed, so a plain
 * rename never needs a rewrite. Returns null when the note is untouched.
 */
export function rewriteNoteForPerson(
	note: Pick<NoteFile, "richContent" | "properties">,
	rewrite: PersonChipRewrite,
): NoteChipPatch | null {
	const rich = rewriteRichDocument(note.richContent, personChipTransform(rewrite));
	const properties = rewritePersonProperties(note.properties, rewrite);

	if (!rich.changed && !properties.changed) {
		return null;
	}

	const patch: NoteChipPatch = {};
	if (rich.changed) patch.richContent = rich.document;
	if (properties.changed) patch.properties = properties.properties;
	return patch;
}
