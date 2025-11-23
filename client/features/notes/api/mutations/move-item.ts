import { move } from "@/api/storage/crud";

const STORAGE_KEY = "Skriuw_notes";

export async function moveItem(itemId: string, targetFolderId: string | null): Promise<boolean> {
	try {
		return await move(STORAGE_KEY, itemId, targetFolderId);
	} catch (error) {
		throw new Error(`Failed to move item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

