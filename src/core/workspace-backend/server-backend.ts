import { createNote, deleteNote, updateNote } from "@/domain/notes/actions";
import { createFolder, deleteFolder, updateFolder } from "@/domain/folders/actions";
import type { WorkspaceBackend } from "./types";

export const serverBackend: WorkspaceBackend = {
	mode: "server",
	createNote,
	updateNote,
	deleteNote,
	createFolder,
	updateFolder,
	deleteFolder,
};
