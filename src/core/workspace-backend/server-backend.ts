import {
	createNote,
	deleteNote,
	fetchNote,
	fetchNoteBacklinks,
	fetchNoteGraph,
	fetchNotes,
	fetchNoteVersions,
	restoreNoteVersion,
	updateNote,
} from "@/domain/notes/actions";
import { createFolder, deleteFolder, updateFolder } from "@/domain/folders/actions";
import {
	createJournalEntry,
	createJournalTag,
	deleteJournalEntry,
	deleteJournalTag,
	updateJournalEntry,
} from "@/domain/journal/actions";
import type { WorkspaceBackend } from "./types";

export const serverBackend: WorkspaceBackend = {
	mode: "server",
	capabilities: {
		journal: true,
		sharing: true,
		collaboration: true,
		notifications: true,
		ai: true,
	},

	createNote,
	updateNote,
	deleteNote,
	restoreNoteVersion,

	getNote: fetchNote,
	getNotes: fetchNotes,
	getNoteVersions: fetchNoteVersions,
	getNoteBacklinks: fetchNoteBacklinks,
	getNoteGraph: fetchNoteGraph,

	createFolder,
	updateFolder,
	deleteFolder,

	createJournalEntry,
	updateJournalEntry,
	deleteJournalEntry,
	createJournalTag,
	deleteJournalTag,
};
