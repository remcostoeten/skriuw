import {
	createNote,
	deleteNote,
	deleteNotes,
	fetchNote,
	fetchNoteBacklinks,
	fetchNoteGraph,
	fetchNotes,
	fetchNoteVersions,
	listNotes,
	restoreNoteVersion,
	updateNote,
} from "@/domain/notes/actions";
import { createFolder, deleteFolder, listFolders, updateFolder } from "@/domain/folders/actions";
import {
	createJournalEntry,
	createJournalTag,
	deleteJournalEntry,
	deleteJournalTag,
	listJournalEntries,
	listJournalTags,
	updateJournalEntry,
} from "@/domain/journal/actions";
import {
	emptyTrash,
	fetchTrashBatches,
	purgeTrashBatch,
	restoreTrashBatch,
} from "@/domain/trash/actions";
import {
	createPerson,
	deletePerson,
	listPeople,
	listPersonNotes,
	mergePersons,
	updatePerson,
} from "@/domain/people/actions";
import { deleteTag, listTagNotes, listTags, renameTag, setTagColor } from "@/domain/tags/actions";
import { uploadNoteCoverImage } from "@/domain/notes/note-cover-upload";
import { searchNotes } from "@/features/notes/server/search-notes";
import type { WorkspaceBackend } from "./types";

export const serverBackend: WorkspaceBackend = {
	mode: "server",
	capabilities: {
		journal: true,
		sharing: true,
		collaboration: true,
		notifications: true,
		ai: true,
		trash: true,
		history: true,
		coverUpload: true,
	},

	searchNotes,

	uploadCoverImage(file) {
		const formData = new FormData();
		formData.set("file", file);
		return uploadNoteCoverImage(formData);
	},

	createNote,
	updateNote,
	deleteNote,
	deleteNotes,
	restoreNoteVersion,

	getNote: fetchNote,
	listNotes,
	getNotes: fetchNotes,
	getNoteVersions: fetchNoteVersions,
	getNoteBacklinks: fetchNoteBacklinks,
	getNoteGraph: fetchNoteGraph,

	createFolder,
	listFolders,
	updateFolder,
	deleteFolder,

	listTrash: fetchTrashBatches,
	restoreTrash: restoreTrashBatch,
	purgeTrash: purgeTrashBatch,
	emptyTrash,

	createJournalEntry,
	updateJournalEntry,
	deleteJournalEntry,
	listJournalEntries,
	createJournalTag,
	deleteJournalTag,
	listJournalTags,

	listPeople,
	createPerson,
	updatePerson,
	deletePerson,
	mergePersons,
	listPersonNotes,

	listTags,
	setTagColor,
	renameTag,
	deleteTag,
	listTagNotes,
};
