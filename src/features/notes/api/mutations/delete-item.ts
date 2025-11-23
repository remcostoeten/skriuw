import { destroy } from "@/api/storage/crud/destroy";

const STORAGE_KEY = "Skriuw_notes";

export async function deleteItem(id: string): Promise<boolean> {
	const destroyFn = destroy;
	try {
		return await destroyFn(STORAGE_KEY, id);
	} catch (error) {
		throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
	}
}

