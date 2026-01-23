import { user } from "./schema";
import { createUserIndex, createUserCompositeIndex } from "./user-owned";
import { pgTable, text, bigint, index, pgEnum } from "drizzle-orm/pg-core";

// Entity types that can generate activity events
export const entityTypeEnum = pgEnum('entity_type', ['note', 'folder', 'task'])

// Actions that can be performed on entities
export const actionTypeEnum = pgEnum('action_type', [
	'created',
	'updated',
	'deleted',
	'checked', // task completed
	'unchecked', // task uncompleted
	'moved', // note/folder moved
	'pinned',
	'unpinned',
	'favorited',
	'unfavorited'
])

export const activityEvents = pgTable(
	'activity_events',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		entityType: entityTypeEnum('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		action: actionTypeEnum('action').notNull(),
		// Cached entity name for display without joins
		entityName: text('entity_name').notNull(),
		// Optional JSON metadata for additional context
		metadata: text('metadata'),
		createdAt: bigint('created_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		// For fetching user's activity
		userIdx: createUserIndex('activity_events', table.userId),
		// For calendar queries (activity by date range)
		createdAtIdx: index('activity_events_created_at_idx').on(table.createdAt),
		// For efficient calendar heatmap queries
		userCreatedAtIdx: createUserCompositeIndex(
			'activity_events',
			'created_at',
			table.userId,
			table.createdAt
		),
		// For fetching activity related to a specific entity
		entityIdx: index('activity_events_entity_idx').on(table.entityType, table.entityId)
	})
)

// Type exports
export type ActivityEvent = typeof activityEvents.$inferSelect
export type NewActivityEvent = typeof activityEvents.$inferInsert
export type EntityType = (typeof entityTypeEnum.enumValues)[number]
export type ActionType = (typeof actionTypeEnum.enumValues)[number]
