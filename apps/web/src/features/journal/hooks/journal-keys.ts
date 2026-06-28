export const journalKeys = {
	all: ["journal"] as const,
	entries: (scope?: string) =>
		scope
			? ([...journalKeys.all, "entries", scope] as const)
			: ([...journalKeys.all, "entries"] as const),
	tags: (scope?: string) =>
		scope
			? ([...journalKeys.all, "tags", scope] as const)
			: ([...journalKeys.all, "tags"] as const),
	workspaceTags: (scope?: string) =>
		scope
			? ([...journalKeys.all, "workspace-tags", scope] as const)
			: ([...journalKeys.all, "workspace-tags"] as const),
	userScope: (userId: string) => `user:${userId}`,
	localScope: () => "local",
};
