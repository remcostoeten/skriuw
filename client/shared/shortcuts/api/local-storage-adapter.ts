import { ShortcutId, KeyCombo } from '../shortcut-definitions';
import { ShortcutStorageAPI, CustomShortcut } from './types';

const STORAGE_KEY = 'quantum-works:shortcuts:custom';

/**
 * LocalStorage implementation of ShortcutStorageAPI
 * This can be easily swapped for InstantDB, Drizzle, ElectricSQL, etc.
 */
export class LocalStorageShortcutAdapter implements ShortcutStorageAPI {
    private getStorageData(): Record<string, CustomShortcut> {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to read shortcuts from localStorage:', error);
            return {};
        }
    }

    private setStorageData(data: Record<string, CustomShortcut>): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save shortcuts to localStorage:', error);
        }
    }

    async getCustomShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>> {
        const data = this.getStorageData();
        const result: Record<string, KeyCombo[]> = {};

        for (const [id, shortcut] of Object.entries(data)) {
            result[id as ShortcutId] = shortcut.keys;
        }

        return result;
    }

    async saveCustomShortcut(id: ShortcutId, keys: KeyCombo[]): Promise<void> {
        const data = this.getStorageData();
        data[id] = {
            id,
            keys,
            customizedAt: new Date().toISOString(),
        };
        this.setStorageData(data);
    }

    async resetShortcut(id: ShortcutId): Promise<void> {
        const data = this.getStorageData();
        delete data[id];
        this.setStorageData(data);
    }

    async resetAllShortcuts(): Promise<void> {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to reset shortcuts:', error);
        }
    }
}

