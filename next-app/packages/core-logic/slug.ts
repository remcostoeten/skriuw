/**
 * Converts a string to a URL-friendly slug
 */
export function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '') // Remove special characters
			.replace(/[\s_-]+/g, '-') // Replace spaces, underscores, and multiple hyphens with single hyphen
			.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
			.slice(0, 100) || 'note'
	) // Limit length and provide fallback
}

/**
 * Generates a unique slug for a note, handling duplicates
 */
export function generateNoteSlug(
	noteName: string,
	noteId: string,
	existingSlugs: Map<string, string>
): string {
	const baseSlug = slugify(noteName)

	// If slug is unique, use it
	if (!existingSlugs.has(baseSlug) || existingSlugs.get(baseSlug) === noteId) {
		return baseSlug
	}

	// If duplicate, append a short version of the ID
	const shortId = noteId.slice(-6) // Last 6 characters of ID
	return `${baseSlug}-${shortId}`
}
