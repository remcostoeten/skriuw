import type { BaseEntity } from "@/shared/types/base-entity";

/**
 * Settings entity stored in storage
 */
export interface SettingsEntity extends BaseEntity {
	id: 'app-settings';
	settings: Record<string, any>;
}

