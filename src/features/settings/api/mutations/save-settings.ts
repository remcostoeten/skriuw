import { setStorageValue } from "@/api/storage/simple-storage";

const STORAGE_KEY = "app:settings";

export async function saveSettings(settings: Record<string, any>): Promise<void> {
	try {
		await setStorageValue(STORAGE_KEY, { settings });
	} catch (error) {
		throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`);
	}
}

