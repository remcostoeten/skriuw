export const sharingKeys = {
	all: ["sharing"] as const,
	share: (noteId: string) => [...sharingKeys.all, noteId] as const,
};
