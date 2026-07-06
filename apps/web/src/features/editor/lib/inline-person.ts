const MAX_PERSON_NAME_LENGTH = 80;
const MAX_PERSON_LABEL_LENGTH = 24;

export function normalizeInlinePersonName(name: string): string {
	return name.trim().replace(/^\$+/, "").replace(/\s+/g, " ").slice(0, MAX_PERSON_NAME_LENGTH);
}

export function formatInlinePersonLabel(name: string): string {
	const normalized = normalizeInlinePersonName(name);
	if (!normalized) return "$";
	if (normalized.length <= MAX_PERSON_LABEL_LENGTH) {
		return normalized;
	}
	return `${normalized.slice(0, MAX_PERSON_LABEL_LENGTH)}…`;
}
