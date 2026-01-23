import { validateConnectorConfig } from "../../features/backup/core/validation";
import { describe, it, expect } from "vitest";

describe('validateConnectorConfig', () => {
	it('validates s3 config', () => {
		const result = validateConnectorConfig('s3', {
			accessKeyId: 'AKIA123',
			secretAccessKey: 'secret',
			region: 'us-east-1',
			bucket: 'my-bucket'
		})
		expect(result.bucket).toBe('my-bucket')
	})

	it('rejects missing s3 fields', () => {
		expect(() =>
			validateConnectorConfig('s3', {
				accessKeyId: '',
				secretAccessKey: '',
				region: '???',
				bucket: ''
			})
		).toThrow()
	})

	it('validates dropbox config', () => {
		const result = validateConnectorConfig('dropbox', {
			accessToken: 'token',
			rootPath: '/Apps/Skriuw'
		})
		expect(result.rootPath).toBe('/Apps/Skriuw')
	})

	it('validates google drive config', () => {
		const result = validateConnectorConfig('google-drive', {
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			folderId: 'folder'
		})
		expect(result.clientSecret).toBe('secret')
	})
})
