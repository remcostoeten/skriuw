const MAX_INLINE_USER_LABEL_LENGTH = 24;

export function normalizeInlineUserName(name: string): string {
	return name
		.trim()
		.replace(/^\$+/, "")
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
}

export function formatInlineUserLabel(name: string): string {
	const normalized = normalizeInlineUserName(name);
	if (!normalized) return "$";
	if (normalized.length <= MAX_INLINE_USER_LABEL_LENGTH) {
		return `$${normalized}`;
	}

	return `$${normalized.slice(0, MAX_INLINE_USER_LABEL_LENGTH)}...`;
}
