export const tagsKeys = {
	all: ["note-tags"] as const,
	list: (scope?: string) =>
		scope ? ([...tagsKeys.all, "list", scope] as const) : ([...tagsKeys.all, "list"] as const),
	notes: (scope: string, name: string) => [...tagsKeys.all, "notes", scope, name] as const,
};
