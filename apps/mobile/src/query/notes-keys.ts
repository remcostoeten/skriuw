// Query-key discipline ported verbatim from web (features/notes/lib/notes-keys.ts)
// so cache semantics match across clients. The persister below relies on the
// `detail` shape to persist BODIES only.
export const notesKeys = {
	all: ["notes"] as const,
	files: (folderId?: string | null) => ["notes", "files", folderId ?? "root"] as const,
	detail: (id: string) => ["notes", "detail", id] as const,
	folders: ["notes", "folders"] as const,
	search: (query: string) => ["notes", "search", query] as const,
};

/** True for query keys whose data should survive offline. */
export function isPersistableKey(key: readonly unknown[]): boolean {
	return (
		(key[0] === "notes" && key[1] === "detail") ||
		(key[0] === "journal" && key[1] === "entries")
	);
}
