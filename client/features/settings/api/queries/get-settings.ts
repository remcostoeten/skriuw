import { read } from "@/api/storage/crud";
import type { SettingsEntity } from "../types";

const STORAGE_KEY = "app:settings";

export async function getSettings(): Promise<Record<string, any> | null> {
	try {
		const result = await read<SettingsEntity>(STORAGE_KEY, { getById: 'app-settings' });
		
		if (result && typeof result === 'object' && 'settings' in result) {
			return result.settings;
		}
		
		return null;
	} catch (error) {
		console.error('Failed to get settings:', error);
		return null;
	}
}

