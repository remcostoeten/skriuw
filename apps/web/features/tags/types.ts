import type { BaseEntity, UUID } from '@skriuw/shared'

export type Tag = BaseEntity & {
	name: string
	color: string
	userId?: UUID
}

export type TagWithCount = Tag & {
	noteCount: number
}

export type CreateTagInput = {
	name: string
	color?: string
}

export type UpdateTagInput = {
	name?: string
	color?: string
}
