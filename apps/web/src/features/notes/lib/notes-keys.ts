export const notesKeys = {
	all: ["notes"] as const,
	files: (scope?: string) =>
		scope
			? ([...notesKeys.all, "files", scope] as const)
			: ([...notesKeys.all, "files"] as const),
	detail: (id: string) => [...notesKeys.all, "files", id] as const,
	backlinksAll: () => [...notesKeys.all, "backlinks"] as const,
	backlinks: (id: string) => [...notesKeys.backlinksAll(), id] as const,
	versionsAll: () => [...notesKeys.all, "versions"] as const,
	versions: (id: string) => [...notesKeys.versionsAll(), id] as const,
	folders: (scope?: string) =>
		scope
			? ([...notesKeys.all, "folders", scope] as const)
			: ([...notesKeys.all, "folders"] as const),
	graph: (scope?: string) =>
		scope
			? ([...notesKeys.all, "graph", scope] as const)
			: ([...notesKeys.all, "graph"] as const),
	trash: (scope?: string) =>
		scope
			? ([...notesKeys.all, "trash", scope] as const)
			: ([...notesKeys.all, "trash"] as const),
	userScope: (userId: string) => `user:${userId}`,
	localScope: () => "local",
};
