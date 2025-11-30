import { setStorageValue } from "@/api/storage/simple-storage";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Reset all custom shortcuts (delete all)
 */
export async function resetAllShortcuts(): Promise<boolean> {
	try {
		await setStorageValue(STORAGE_KEY, {});
		return true;
	} catch (error) {
		throw new Error(`Failed to reset all shortcuts: ${error instanceof Error ? error.message : String(error)}`);
	}
}
