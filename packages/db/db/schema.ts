import { pgTable, text, integer, bigint, index, boolean, timestamp } from 'drizzle-orm/pg-core'

export const notes = pgTable(
	'notes',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		content: text('content').notNull(),
		parentFolderId: text('parent_folder_id'),
		pinned: integer('pinned').default(0),
		pinnedAt: bigint('pinned_at', { mode: 'number' }),
		favorite: integer('favorite').default(0),
		deletedAt: bigint('deleted_at', { mode: 'number' }),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
		type: text('type').notNull().default('note')
	},
	(table) => ({
		parentFolderIdx: index('notes_parent_folder_idx').on(
			table.parentFolderId
		),
		deletedAtIdx: index('notes_deleted_at_idx').on(table.deletedAt),
		pinnedIdx: index('notes_pinned_idx').on(table.pinned),
		updatedAtIdx: index('notes_updated_at_idx').on(table.updatedAt)
	})
)

export const folders = pgTable(
	'folders',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		parentFolderId: text('parent_folder_id'),
		pinned: integer('pinned').default(0),
		pinnedAt: bigint('pinned_at', { mode: 'number' }),
		deletedAt: bigint('deleted_at', { mode: 'number' }),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
		type: text('type').notNull().default('folder')
	},
	(table) => ({
		parentFolderIdx: index('folders_parent_folder_idx').on(
			table.parentFolderId
		),
		deletedAtIdx: index('folders_deleted_at_idx').on(table.deletedAt)
	})
)

export const settings = pgTable(
	'settings',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull().unique(),
		value: text('value').notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		keyIdx: index('settings_key_idx').on(table.key)
	})
)

export const tasks = pgTable(
	'tasks',
	{
		id: text('id').primaryKey(),
		noteId: text('note_id').notNull(),
		blockId: text('block_id').notNull(),
		content: text('content').notNull(),
		description: text('description'),
		checked: integer('checked').default(0).notNull(),
		dueDate: bigint('due_date', { mode: 'number' }),
		parentTaskId: text('parent_task_id'),
		position: integer('position').default(0).notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		noteIdIdx: index('tasks_note_id_idx').on(table.noteId),
		blockIdIdx: index('tasks_block_id_idx').on(table.blockId),
		noteBlockIdx: index('tasks_note_block_idx').on(
			table.noteId,
			table.blockId
		),
		dueDateIdx: index('tasks_due_date_idx').on(table.dueDate)
	})
)

export const shortcuts = pgTable('shortcuts', {
	id: text('id').primaryKey(),
	keys: text('keys').notNull(),
	customizedAt: bigint('customized_at', { mode: 'number' }).notNull(),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
	updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

export const aiUsage = pgTable(
	'ai_usage',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		month: text('month').notNull(), // Format: YYYY-MM
		count: integer('count').default(0).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		userMonthIdx: index('ai_usage_user_month_idx').on(
			table.userId,
			table.month
		)
	})
)

// Type exports for use in app
export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
export type Folder = typeof folders.$inferSelect
export type NewFolder = typeof folders.$inferInsert
export type Setting = typeof settings.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Shortcut = typeof shortcuts.$inferSelect
export type AiUsage = typeof aiUsage.$inferSelect
export type NewAiUsage = typeof aiUsage.$inferInsert

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	isAnonymous: boolean("is_anonymous"),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => user.id),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => user.id),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
