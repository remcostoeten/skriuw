export const journalKeys = {
	all: ["journal"] as const,
	entries: (scope?: string) =>
		scope
			? ([...journalKeys.all, "entries", scope] as const)
			: ([...journalKeys.all, "entries"] as const),
	userScope: (userId: string) => `user:${userId}`,
	localScope: () => "local",
};
