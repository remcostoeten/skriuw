/**
 * Count whitespace-delimited words in a string. Shared by every editor surface
 * (textarea, rich-text, markdown-vim) and the document word counter so they all
 * agree on what a "word" is.
 */
export function countWords(text: string): number {
	const trimmed = text.trim();
	return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}
