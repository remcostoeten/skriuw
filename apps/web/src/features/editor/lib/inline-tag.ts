const MAX_INLINE_TAG_LABEL_LENGTH = 24;

export function normalizeInlineTagName(tag: string): string {
	return tag
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function formatInlineTagLabel(tag: string): string {
	const normalized = normalizeInlineTagName(tag);
	if (!normalized) return "#";
	if (normalized.length <= MAX_INLINE_TAG_LABEL_LENGTH) {
		return `#${normalized}`;
	}

	return `#${normalized.slice(0, MAX_INLINE_TAG_LABEL_LENGTH)}...`;
}
