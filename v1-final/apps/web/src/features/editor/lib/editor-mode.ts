import type { NoteFile } from "@/types/notes";

const MDX_EXTENSION_PATTERN = /\.mdx$/i;
const FRONTMATTER_PATTERN = /^\s*---[\s\S]*?---/;
const MDX_IMPORT_PATTERN = /^\s*import\s+.+?from\s+["'][^"']+["'];?\s*$/m;
const JSX_BLOCK_PATTERN = /^\s*<\/?[A-Z][\w.:-]*(?:\s|>|\/>)/m;

export function isMdxNote(file: Pick<NoteFile, "name" | "content"> | null | undefined): boolean {
	if (!file) return false;
	if (MDX_EXTENSION_PATTERN.test(file.name)) return true;

	return (
		FRONTMATTER_PATTERN.test(file.content) &&
		(MDX_IMPORT_PATTERN.test(file.content) || JSX_BLOCK_PATTERN.test(file.content))
	);
}

/**
 * Resolves the editor mode for a note. Pass `allowRaw: false` on surfaces that
 * have no raw editor (mobile) — it overrides both the note's preference and the
 * MDX force-to-raw rule.
 */
export function resolveEditorMode(
	file: Pick<NoteFile, "name" | "content" | "preferredEditorMode"> | null | undefined,
	fallbackMode: "raw" | "block",
	allowRaw = true,
): "raw" | "block" {
	if (!file) return "block";
	if (!allowRaw) return "block";
	if (isMdxNote(file)) return "raw";
	return file.preferredEditorMode ?? fallbackMode;
}
