import type { EntityType, ActionType } from '@skriuw/db'

export type ActivityEvent = {
	id: string
	userId: string
	entityType: EntityType
	entityId: string
	action: ActionType
	entityName: string
	metadata?: string | null
	createdAt: number
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
	id: string
	entityType: EntityType
	entityId: string
	action: ActionType
	entityName: string
	createdAt: number
	metadata?: Record<string, unknown>
}

export type RecentActivityGroup = {
	date: string // YYYY-MM-DD
	items: RecentActivityItem[]
}

export type RecordActivityInput = {
	entityType: EntityType
	entityId: string
	action: ActionType
	entityName: string
	metadata?: Record<string, unknown>
}
