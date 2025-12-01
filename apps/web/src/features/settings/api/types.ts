import type { BaseEntity } from '@skriuw/storage/generic-types';

/**
 * Settings entity stored in storage
 */
export interface SettingsEntity extends BaseEntity {
	id: 'app-settings';
	settings: Record<string, any>;
}

