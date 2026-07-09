import type { NoteFile, NoteVersion } from "@/domain/notes/models";
import { normalizeNoteProperties } from "@/domain/notes/properties";
import type { PersistedNote } from "@/core/persistence/types";
import { resolveRichDocument } from "@/domain/notes/rich-document";

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
		sortOrder: note.sortOrder ?? 0,
		tags: note.tags?.map((tag) => tag as string),
		properties: normalizeNoteProperties(note.properties),
		icon: note.icon,
		cover: note.cover,
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
	properties?: PersistedNote["properties"] | null;
	reason: "created" | "autosave" | "checkpoint" | "rename" | "restore";
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
		properties: normalizeNoteProperties(note.properties),
		reason: note.reason,
		contentHash: note.content_hash,
		createdAt: new Date(note.created_at),
	};
}
