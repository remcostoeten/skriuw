export const notesKeys = {
	all: ["notes"] as const,
	files: () => [...notesKeys.all, "files"] as const,
	detail: (id: string) => [...notesKeys.all, "files", id] as const,
	backlinksAll: () => [...notesKeys.all, "backlinks"] as const,
	backlinks: (id: string) => [...notesKeys.backlinksAll(), id] as const,
	folders: () => [...notesKeys.all, "folders"] as const,
};
