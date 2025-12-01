import { create } from '@skriuw/storage/crud/create';
import { getSettings } from "@/features/settings/api/queries/get-settings";

import { getInitialNoteContent } from "../../utils/get-initial-note-content";

import type { Note, CreateNoteData } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function createNote(data: CreateNoteData): Promise<Note> {
	const createFn = create;
	try {
		// If content is not provided, get initial content based on settings
		let initialContent = data.content;
		if (!initialContent || initialContent.length === 0) {
			const settings = await getSettings();
			const template = (settings?.defaultNoteTemplate as 'empty' | 'h1' | 'h2') || 'empty';
			initialContent = getInitialNoteContent(template);
		}

		const result = await createFn(STORAGE_KEY, {
			type: 'note',
			name: data.name,
			content: initialContent,
			parentFolderId: data.parentFolderId,
		} as any);
		return result as Note;
	} catch (error) {
		throw new Error(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);
	}
}

