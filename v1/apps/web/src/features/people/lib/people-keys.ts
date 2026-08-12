export const peopleKeys = {
	all: ["people"] as const,
	list: (scope?: string) =>
		scope
			? ([...peopleKeys.all, "list", scope] as const)
			: ([...peopleKeys.all, "list"] as const),
};
