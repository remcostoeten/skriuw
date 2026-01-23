export type { BaseEntity, Timestamp, UUID } from '@skriuw/shared'

export type { Task } from '@skriuw/db'

export type TaskWithNote = {
	noteName: string | null
	userId?: string | null
} & Omit<import('@skriuw/db').Task, 'userId'>
