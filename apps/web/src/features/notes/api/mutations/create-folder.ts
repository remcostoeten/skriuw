import { create } from '@skriuw/storage/crud/create';

import type { Folder, CreateFolderData } from "../../types";

const STORAGE_KEY = "Skriuw_notes";

export async function createFolder(data: CreateFolderData): Promise<Folder> {
	const createFn = create;
	try {
		const result = await createFn(STORAGE_KEY, {
			type: 'folder',
			name: data.name,
			children: [],
			parentFolderId: data.parentFolderId,
		} as any);
		return result as Folder;
	} catch (error) {
		throw new Error(`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`);
	}
}

