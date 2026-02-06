import type { StorageConnectorDefinition } from './types'

export const STORAGE_CONNECTOR_DEFINITIONS: StorageConnectorDefinition[] = [
	{
		type: 's3',
		label: 'Amazon S3',
		description: 'Connect your own S3 bucket for automated backups.',
		docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html',
		fields: [
			{
				name: 'accessKeyId',
				label: 'Access Key ID',
				placeholder: 'AKIA...',
				required: true,
				help: 'Create an IAM user with programmatic access and S3 permissions.'
			},
			{
				name: 'secretAccessKey',
				label: 'Secret Access Key',
				placeholder: '********',
				secret: true,
				required: true,
				help: 'Store securely; used only to sign S3 requests.'
			},
			{
				name: 'region',
				label: 'Region',
				placeholder: 'us-east-1',
				required: true
			},
			{
				name: 'bucket',
				label: 'Bucket Name',
				placeholder: 'skriuw-backups',
				required: true,
				help: 'Bucket name where backups will be stored.'
			},
			{
				name: 'endpoint',
				label: 'Custom Endpoint (optional)',
				placeholder: 'https://s3.eu-central-1.amazonaws.com',
				help: 'Use this for S3-compatible providers like MinIO or Cloudflare R2.'
			}
		]
	},
	{
		type: 'dropbox',
		label: 'Dropbox',
		description: 'Save backups directly into your Dropbox.',
		docsUrl: 'https://www.dropbox.com/developers/documentation',
		fields: [
			{
				name: 'oauth2',
				label: 'Connect with Dropbox',
				type: 'oauth2',
				required: true,
				help: 'Click to authorize Skriuw to access your Dropbox.'
			},
			{
				name: 'rootPath',
				label: 'Folder Path',
				placeholder: '/Apps/Skriuw',
				help: 'Optional: Custom folder path for backups.'
			}
		]
	},
	{
		type: 'google-drive',
		label: 'Google Drive',
		description: 'Store exports in a Drive folder you control.',
		docsUrl: 'https://developers.google.com/drive/api/quickstart/js',
		fields: [
			{
				name: 'oauth2',
				label: 'Connect with Google Drive',
				type: 'oauth2',
				required: true,
				help: 'Click to authorize Skriuw to access your Google Drive.'
			},
			{
				name: 'folderId',
				label: 'Target Folder ID',
				placeholder: 'drive-folder-id',
				help: 'Optional: Leave blank to use root; paste the ID from the Drive URL.'
			}
		]
	}
]
