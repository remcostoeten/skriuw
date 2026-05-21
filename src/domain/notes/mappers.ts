import type { NoteFile, NoteVersion } from "@/domain/notes/models";
import type {
	FolderId,
	IsoTime,
	MarkdownContent,
	NoteId,
	PersistedNote,
	TagName,
} from "@/domain/persistence/types";
import { markdownToRichDocument, resolveRichDocument } from "@/domain/notes/rich-document";

function toIsoTime(date: Date): IsoTime {
	return date.toISOString() as IsoTime;
}

export function toPersistedNote(note: NoteFile): PersistedNote {
	const richContent = note.richContent ?? markdownToRichDocument(note.content);
	const preferredEditorMode = note.preferredEditorMode ?? "block";

	return {
		id: note.id as NoteId,
		name: note.name,
		content: note.content as MarkdownContent,
		richContent,
		preferredEditorMode,
		parentId: note.parentId as FolderId | null,
		tags: note.tags?.map((tag) => tag as TagName),
		createdAt: toIsoTime(note.createdAt),
		updatedAt: toIsoTime(note.modifiedAt),
		journalMeta: note.journalMeta
			? {
					...note.journalMeta,
					tags: note.journalMeta.tags.map((tag) => tag as TagName),
				}
			: undefined,
	};
}

export function fromPersistedNote(note: PersistedNote): NoteFile {
	const richContent = resolveRichDocument(note.content, note.richContent);
	const preferredEditorMode = note.preferredEditorMode ?? "block";

	return {
		id: note.id,
		name: note.name,
		content: note.content,
		richContent,
		preferredEditorMode,
		parentId: note.parentId,
		tags: note.tags?.map((tag) => tag as string),
		createdAt: new Date(note.createdAt),
		modifiedAt: new Date(note.updatedAt),
		journalMeta: note.journalMeta
			? {
					...note.journalMeta,
					tags: note.journalMeta.tags.map((tag) => tag as string),
				}
			: undefined,
	};
}

export type PersistedNoteVersion = {
	id: string;
	note_id: string;
	name: string;
	content: string;
	rich_content: PersistedNote["richContent"] | null;
	preferred_editor_mode: "raw" | "block" | null;
	parent_id: string | null;
	tags?: string[] | null;
	reason: "created" | "autosave" | "rename" | "restore";
	content_hash: string;
	created_at: string;
};

export function fromPersistedNoteVersion(note: PersistedNoteVersion): NoteVersion {
	return {
		id: note.id,
		noteId: note.note_id,
		name: note.name,
		content: note.content,
		richContent: resolveRichDocument(note.content, note.rich_content),
		preferredEditorMode: note.preferred_editor_mode ?? "block",
		parentId: note.parent_id,
		tags: note.tags?.map((tag) => tag as string),
		reason: note.reason,
		contentHash: note.content_hash,
		createdAt: new Date(note.created_at),
	};
}
