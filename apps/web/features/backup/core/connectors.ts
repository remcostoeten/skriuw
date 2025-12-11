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
			},
			{
				name: 'secretAccessKey',
				label: 'Secret Access Key',
				placeholder: '********',
				secret: true,
				required: true,
			},
			{
				name: 'region',
				label: 'Region',
				placeholder: 'us-east-1',
				required: true,
			},
			{
				name: 'bucket',
				label: 'Bucket Name',
				placeholder: 'skriuw-backups',
				required: true,
			},
			{
				name: 'endpoint',
				label: 'Custom Endpoint (optional)',
				placeholder: 'https://s3.eu-central-1.amazonaws.com',
				help: 'Use this for S3-compatible providers like MinIO or Cloudflare R2.',
			},
		],
	},
	{
		type: 'dropbox',
		label: 'Dropbox',
		description: 'Save backups directly into your Dropbox.',
		docsUrl: 'https://www.dropbox.com/developers/documentation',
		fields: [
			{
				name: 'accessToken',
				label: 'Access Token',
				placeholder: 'sl.ABC123...',
				secret: true,
				required: true,
				help: 'Generate a short-lived token from your Dropbox app console.',
			},
			{
				name: 'rootPath',
				label: 'Folder Path',
				placeholder: '/Apps/Skriuw',
			},
		],
	},
	{
		type: 'google-drive',
		label: 'Google Drive',
		description: 'Store exports in a Drive folder you control.',
		docsUrl: 'https://developers.google.com/drive/api/quickstart/js',
		fields: [
			{
				name: 'clientId',
				label: 'Client ID',
				placeholder: 'xxxx.apps.googleusercontent.com',
				required: true,
			},
			{
				name: 'clientSecret',
				label: 'Client Secret',
				placeholder: '********',
				secret: true,
				required: true,
			},
			{
				name: 'refreshToken',
				label: 'Refresh Token',
				placeholder: '1//0example...',
				secret: true,
				required: true,
			},
			{
				name: 'folderId',
				label: 'Target Folder ID',
				placeholder: 'drive-folder-id',
				help: 'Leave blank to use root; paste the ID from the Drive URL.',
			},
		],
	},
]
