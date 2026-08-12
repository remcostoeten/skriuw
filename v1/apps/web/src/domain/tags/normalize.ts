const MAX_TAG_LABEL_LENGTH = 24;

/**
 * Canonical tag identity used by inline tag chips and tag management:
 * strips leading `#`, lowercases, collapses non-alphanumerics to hyphens.
 * Markdown `#tag` tokens keep their own grammar (see TAG_PATTERN in
 * note-links.ts) and are compared case-insensitively against this form.
 */
export function normalizeTagName(tag: string): string {
	return tag
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Display label for a tag chip: `#name`, truncated with an ellipsis. */
export function formatTagLabel(tag: string): string {
	const normalized = normalizeTagName(tag);
	if (!normalized) return "#";
	if (normalized.length <= MAX_TAG_LABEL_LENGTH) {
		return `#${normalized}`;
	}

	return `#${normalized.slice(0, MAX_TAG_LABEL_LENGTH)}...`;
}

/** How a `Note.tags[]` entry or markdown `#token` maps onto a persisted tag label. */
export function normalizeStoredTagEntry(tag: string): string {
	return tag.trim().replace(/^#+/, "").toLowerCase();
}
