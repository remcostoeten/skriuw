import { create, update, read } from "@/api/storage/crud";
import type { SettingsEntity } from "../types";

const STORAGE_KEY = "app:settings";

export async function saveSettings(settings: Record<string, any>): Promise<void> {
	try {
		const existing = await read<SettingsEntity>(STORAGE_KEY, { getById: 'app-settings' });
		
		if (existing && typeof existing === 'object' && 'id' in existing) {
			// Update existing
			await update<SettingsEntity>(STORAGE_KEY, 'app-settings', {
				settings,
			});
		} else {
			// Create new
			await create<SettingsEntity>(STORAGE_KEY, {
				id: 'app-settings',
				settings,
			});
		}
	} catch (error) {
		throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`);
	}
}

