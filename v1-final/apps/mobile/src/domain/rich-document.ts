// ---------------------------------------------------------------------------
// rich-document.ts (mobile copy)
//
// Type model + pure helpers for the BlockNote JSON document format that the
// server stores in Note.richContent (JSONB). This is a placeholder that will be
// REPLACED by importing the real `@skriuw/domain` package once the Phase 0
// extraction (apps/web/src/domain/notes/rich-document.ts) lands. Keep the
// shapes in sync with that module — the read renderer parses against these.
//
// Only the pieces the native read renderer needs are modelled here. There is
// intentionally zero runtime dependency on @blocknote/* (types only on web).
// ---------------------------------------------------------------------------

export type InlineStyles = {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	code?: boolean;
	textColor?: string;
	backgroundColor?: string;
};

/** A run of styled text. */
export type TextInline = {
	type: "text";
	text: string;
	styles?: InlineStyles;
};

/** A standard markdown link. */
export type LinkInline = {
	type: "link";
	href: string;
	content: TextInline[];
};

/** Custom inline chips (Skriuw-specific). */
export type NoteLinkInline = {
	type: "noteLink";
	props: { noteId: string; title: string; alias?: string };
};
export type TagInline = {
	type: "tag";
	props: { tag: string; color?: string };
};
export type PersonInline = {
	type: "person";
	props: { personId: string; name: string };
};
export type UserInline = {
	type: "user";
	props: { userId: string; username: string };
};

export type InlineContent =
	| TextInline
	| LinkInline
	| NoteLinkInline
	| TagInline
	| PersonInline
	| UserInline;

export type BlockProps = {
	level?: 1 | 2 | 3;
	checked?: boolean;
	language?: string;
	url?: string;
	caption?: string;
	textAlignment?: "left" | "center" | "right";
	[key: string]: unknown;
};

export type TableCell = { content: InlineContent[] };
export type TableContent = {
	type: "tableContent";
	rows: { cells: TableCell[] }[];
};

/** Recursive BlockNote block. Unknown `type` values are expected and must be
 *  rendered by the renderer's forward-compatible fallback. */
export type Block = {
	id: string;
	type: string;
	props?: BlockProps;
	content?: InlineContent[] | TableContent;
	children?: Block[];
};

export type RichDocument = Block[];

// --- Helpers ---------------------------------------------------------------

/** Stable stringify of a rich document. REQUIRED for save-echo suppression:
 *  Postgres JSONB reorders object keys, so a naive JSON.stringify comparison
 *  produces false "changed" signals. Sort keys before comparing. */
export function richDocumentKey(doc: RichDocument | null | undefined): string {
	if (!doc) return "";
	return stableStringify(doc);
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	const keys = Object.keys(value as Record<string, unknown>).sort();
	const entries = keys.map(
		(k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
	);
	return `{${entries.join(",")}}`;
}

/** Flatten the block tree into a render list, tracking nesting depth so the
 *  renderer can indent nested lists/toggles. FlashList wants a flat array. */
export type FlatBlock = { block: Block; depth: number };

export function flattenBlocks(doc: RichDocument, depth = 0): FlatBlock[] {
	const out: FlatBlock[] = [];
	for (const block of doc) {
		out.push({ block, depth });
		if (block.children && block.children.length > 0) {
			out.push(...flattenBlocks(block.children, depth + 1));
		}
	}
	return out;
}

/** Return a NEW document with the given block's `checked` prop set. Immutable
 *  (structural sharing) so React Query cache updates trigger re-renders without
 *  mutating cached data. Recurses into children for nested checklists. */
export function setBlockChecked(
	doc: RichDocument,
	blockId: string,
	checked: boolean,
): RichDocument {
	let changed = false;
	const next = doc.map((block) => {
		if (block.id === blockId) {
			changed = true;
			return { ...block, props: { ...block.props, checked } };
		}
		if (block.children && block.children.length > 0) {
			const children = setBlockChecked(block.children, blockId, checked);
			if (children !== block.children) {
				changed = true;
				return { ...block, children };
			}
		}
		return block;
	});
	return changed ? next : doc;
}

/** Extract plain text from inline content (used for previews / a11y labels). */
export function inlineToPlainText(content?: InlineContent[] | TableContent): string {
	if (!content || !Array.isArray(content)) return "";
	return content
		.map((node) => {
			switch (node.type) {
				case "text":
					return node.text;
				case "link":
					return node.content.map((c) => c.text).join("");
				case "noteLink":
					return node.props.alias ?? node.props.title;
				case "tag":
					return `#${node.props.tag}`;
				case "person":
					return `$${node.props.name}`;
				case "user":
					return `@${node.props.username}`;
				default:
					return "";
			}
		})
		.join("");
}
