/**
 * Default markdown body seeded into a freshly created note, named after it.
 * Shared by every "create note" entry point (sidebar, command palette, quick
 * capture) so the starter content stays identical everywhere.
 */
export function generateNoteContent(name: string): string {
	const title = name.replace(/\.md$/, "");
	return `# ${title}

#draft #idea

Start writing here. Use # for tags, @ to mention notes, or /tag and /link note from the block editor.
`;
}
