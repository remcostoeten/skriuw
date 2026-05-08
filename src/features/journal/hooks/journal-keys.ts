export const journalKeys = {
  all: ["journal"] as const,
  entries: () => [...journalKeys.all, "entries"] as const,
  tags: () => [...journalKeys.all, "tags"] as const,
};
