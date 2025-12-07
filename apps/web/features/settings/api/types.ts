import type { BaseEntity } from '@/lib/storage/client'

/**
 * Settings entity stored in storage
 */
export interface SettingsEntity extends BaseEntity {
	id: 'app-settings'
	settings: Record<string, any>
}
