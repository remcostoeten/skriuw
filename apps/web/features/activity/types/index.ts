import type { EntityType, ActionType } from '@skriuw/db'
import type { UUID, Timestamp } from '@skriuw/shared'

export type ActivityEvent = {
	id: UUID
	userId: UUID
	entityType: EntityType
	entityId: UUID
	action: ActionType
	entityName: string
	metadata?: string | null
	createdAt: Timestamp
}

export type CalendarDay = {
	date: string // YYYY-MM-DD
	count: number
	level: 0 | 1 | 2 | 3 | 4 // intensity level for coloring
}

export type CalendarData = {
	days: CalendarDay[]
	totalActivities: number
	startDate: string
	endDate: string
}

export type RecentActivityItem = {
	id: UUID
	entityType: EntityType
	entityId: UUID
	action: ActionType
	entityName: string
	createdAt: Timestamp
	metadata?: Record<string, unknown>
}

export type RecentActivityGroup = {
	date: string // YYYY-MM-DD
	items: RecentActivityItem[]
}

export type RecordActivityInput = {
	entityType: EntityType
	entityId: UUID
	action: ActionType
	entityName: string
	metadata?: Record<string, unknown>
}
