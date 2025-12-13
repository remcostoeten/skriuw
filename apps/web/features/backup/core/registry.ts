import { createDownloadDriver } from './drivers/download-driver'
import { createMemoryDriver } from './drivers/memory-driver'
import { DropboxDriver } from './drivers/dropbox-driver'
import { GoogleDriveDriver } from './drivers/google-drive-driver'
import { S3Driver } from './drivers/s3-driver'
import type {
	DestinationConfig,
	DestinationSchema,
	DestinationType,
	StorageDriver,
} from './types'

export interface DestinationDefinition extends DestinationSchema {
	type: DestinationType
	createDriver(config: DestinationConfig): StorageDriver
}

export const DESTINATION_DEFINITIONS: DestinationDefinition[] = [
	{
		type: 'memory',
		label: 'In-memory (dev)',
		description: 'Ephemeral storage for contract tests and local validation.',
		fields: [],
		defaults: { encrypt: false, chunkSize: 2 * 1024 * 1024 },
		createDriver: () => createMemoryDriver(),
		notes: 'Not persisted; use only for development or automated tests.',
	},
	{
		type: 'download',
		label: 'Local download',
		description: 'Create a downloadable archive (manifest + chunks) via the browser.',
		fields: [
			{
				name: 'filenamePrefix',
				label: 'File name prefix',
				type: 'text',
				placeholder: 'skriuw-backup',
				help: 'Prepended to the generated archive filename.',
			},
		],
		defaults: { encrypt: false, chunkSize: 4 * 1024 * 1024 },
		createDriver: (config) =>
			createDownloadDriver({
				filenamePrefix: String(config.config.filenamePrefix || 'skriuw-backup'),
			}),
		notes: 'Uses existing file-export flow; good for manual backups before providers are added.',
	},
	{
		type: 's3',
		label: 'Amazon S3',
		description: 'Backup directly to an S3 bucket or compatible provider.',
		fields: [], // Fields are handled by the connector config UI
		createDriver: () => new S3Driver(),
	},
	{
		type: 'dropbox',
		label: 'Dropbox',
		description: 'Backup to your Dropbox App folder.',
		fields: [],
		createDriver: () => new DropboxDriver(),
	},
	{
		type: 'google-drive',
		label: 'Google Drive',
		description: 'Backup to a folder in your Google Drive.',
		fields: [],
		createDriver: () => new GoogleDriveDriver(),
	},
]

export function getDestinationDefinition(type: DestinationType): DestinationDefinition | undefined {
	return DESTINATION_DEFINITIONS.find((definition) => definition.type === type)
}
