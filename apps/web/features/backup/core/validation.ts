import type { StorageConnectorType } from './types'
import { z } from 'zod'

const nonEmpty = z.string({ message: 'Required' }).trim().min(1, 'Required')
const optionalUrlish = z
	.string()
	.trim()
	.url('Must be a valid URL')
	.or(z.string().trim().length(0))
	.optional()

const regionPattern = /^[a-z0-9-]+$/i

export const connectorSchemas: Record<StorageConnectorType, z.ZodTypeAny> = {
	s3: z.object({
		accessKeyId: nonEmpty,
		secretAccessKey: nonEmpty,
		region: z
			.string({ message: 'Required' })
			.trim()
			.regex(regionPattern, 'Invalid region format'),
		bucket: nonEmpty,
		endpoint: optionalUrlish
	}),
	dropbox: z.object({
		accessToken: nonEmpty,
		rootPath: z.string().trim().optional()
	}),
	'google-drive': z.object({
		clientId: nonEmpty,
		clientSecret: nonEmpty,
		refreshToken: nonEmpty,
		folderId: z.string().trim().optional()
	})
}

export function validateConnectorConfig(
	type: StorageConnectorType,
	config: Record<string, string>
) {
	const schema = connectorSchemas[type]
	if (!schema) {
		throw new Error(`Unknown connector type: ${type}`)
	}
	const result = schema.safeParse(config)
	if (!result.success) {
		const message = result.error.issues[0]?.message || 'Invalid configuration'
		throw new Error(message)
	}
	return result.data as Record<string, string>
}
