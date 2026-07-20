/**
 * Minimal markdown body for a new note. Feature teaching belongs in contextual
 * UI and the replayable tour, never in a person's document or automatic tags.
 * Shared by every create entry point so quick capture is just as calm.
 */
export function generateNoteContent(name: string): string {
	const title = name.replace(/\.md$/, "");
	return `# ${title}\n\n`;
}
