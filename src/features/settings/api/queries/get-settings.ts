import { getStorageValue } from "@/api/storage/simple-storage";

const STORAGE_KEY = "app:settings";

export async function getSettings(): Promise<Record<string, any> | null> {
	try {
		const data = await getStorageValue<{ settings: Record<string, any> }>(STORAGE_KEY);
		return data?.settings ?? null;
	} catch (error) {
		console.error('Failed to get settings:', error);
		return null;
	}
}

