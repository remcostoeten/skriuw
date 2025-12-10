import { BaseEntity } from "@skriuw/crud"

/**
 * Settings entity stored in storage
 */
export interface SettingsEntity extends BaseEntity {
	id: 'app-settings'
	settings: Record<string, any>
}
