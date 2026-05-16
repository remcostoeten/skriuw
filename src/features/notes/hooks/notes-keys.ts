export const notesKeys = {
  all: ["notes"] as const,
  files: () => [...notesKeys.all, "files"] as const,
  folders: () => [...notesKeys.all, "folders"] as const,
};
