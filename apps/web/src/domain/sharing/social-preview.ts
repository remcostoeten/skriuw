const MAX_PREVIEW_LENGTH = 160;

export function buildSharePreviewDescription(
	content: string,
	requiresPassword: boolean,
): string {
	if (requiresPassword) {
		return "Password-protected note shared via Skriuw.";
	}

	const plain = content
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[[^\]]*\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^-{3,}\s*$/gm, "")
		.replace(/[*_~>|]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!plain) return "Shared note via Skriuw.";
	if (plain.length <= MAX_PREVIEW_LENGTH) return plain;
	return `${plain.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}
