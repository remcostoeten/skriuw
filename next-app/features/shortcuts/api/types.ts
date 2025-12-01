import type { ShortcutId, KeyCombo } from "../shortcut-definitions";
import type { BaseEntity } from '@skriuw/storage/generic-types';

/**
 * Custom shortcut entity that extends BaseEntity for CRUD operations
 */
export interface CustomShortcut extends BaseEntity {
	id: ShortcutId;
	keys: KeyCombo[];
	customizedAt: string; // ISO date string
}

/**
 * Data required to create a custom shortcut
 */
export interface CreateCustomShortcutData {
	id: ShortcutId;
	keys: KeyCombo[];
}

