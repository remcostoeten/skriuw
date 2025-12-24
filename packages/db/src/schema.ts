
import { pgTable, text, integer, bigint, index, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { createUserIndex, createUserCompositeIndex } from './user-owned'


export const notes = pgTable(
	'notes',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		content: text('content').notNull(),
		parentFolderId: text('parent_folder_id'),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		pinned: integer('pinned').default(0),
		pinnedAt: bigint('pinned_at', { mode: 'number' }),
		favorite: integer('favorite').default(0),
		isPublic: boolean('is_public').default(false).notNull(),
		publicId: text('public_id'),
		publicViews: integer('public_views').default(0).notNull(),
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
		updatedAtIdx: index('notes_updated_at_idx').on(table.updatedAt),
		userIdx: createUserIndex('notes', table.userId),
		userParentIdx: createUserCompositeIndex('notes', 'parent', table.userId, table.parentFolderId),
		publicIdIdx: uniqueIndex('notes_public_id_idx').on(table.publicId)
	})
)

export const folders = pgTable(
	'folders',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		parentFolderId: text('parent_folder_id'),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
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
		deletedAtIdx: index('folders_deleted_at_idx').on(table.deletedAt),
		userIdx: createUserIndex('folders', table.userId),
		userParentIdx: createUserCompositeIndex('folders', 'parent', table.userId, table.parentFolderId)
	})
)

export const settings = pgTable(
	'settings',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull().unique(),
		value: text('value').notNull(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		keyIdx: index('settings_key_idx').on(table.key),
		userIdx: createUserIndex('settings', table.userId),
		userKeyIdx: createUserCompositeIndex('settings', 'key', table.userId, table.key)
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
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
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
		dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
		userIdx: createUserIndex('tasks', table.userId),
		userNoteIdx: createUserCompositeIndex('tasks', 'note', table.userId, table.noteId)
	})
)

export const shortcuts = pgTable(
	'shortcuts',
	{
		id: text('id').primaryKey(),
		keys: text('keys').notNull(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		customizedAt: bigint('customized_at', { mode: 'number' }).notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		userIdx: createUserIndex('shortcuts', table.userId)
	})
)

export const storageConnectors = pgTable(
	'storage_connectors',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		type: text('type').notNull(), // 's3' | 'dropbox' | 'google-drive'
		name: text('name').notNull(),
		status: text('status').notNull().default('configured'),
		config: text('config').notNull(), // JSON, encrypted sensitive fields
		oauth2Tokens: text('oauth2_tokens'), // JSON, encrypted
		lastValidatedAt: bigint('last_validated_at', { mode: 'number' }),
		lastError: text('last_error'),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(table) => ({
		userIdx: createUserIndex('storage_connectors', table.userId),
		userTypeIdx: createUserCompositeIndex('storage_connectors', 'type', table.userId, table.type)
	})
)

export const noteVisitors = pgTable(
	'note_visitors',
	{
		id: text('id').primaryKey(),
		noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
		visitorKey: text('visitor_key').notNull(),
		viewerUserId: text('viewer_user_id'),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
	},
	(table) => ({
		noteIdx: index('note_visitors_note_idx').on(table.noteId),
		noteVisitorIdx: uniqueIndex('note_visitors_note_visitor_idx').on(table.noteId, table.visitorKey),
		visitorIdx: index('note_visitors_visitor_idx').on(table.visitorKey),
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
export type StorageConnector = typeof storageConnectors.$inferSelect
export type NewStorageConnector = typeof storageConnectors.$inferInsert
export type NoteVisitor = typeof noteVisitors.$inferSelect
export type NewNoteVisitor = typeof noteVisitors.$inferInsert


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

// Seed templates - admin-managed notes/folders cloned to new users
export const seedTemplateFolders = pgTable(
	'seed_template_folders',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		parentFolderId: text('parent_folder_id'),
		order: integer('order').default(0).notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
	},
	(table) => ({
		parentFolderIdx: index('seed_folders_parent_idx').on(table.parentFolderId),
		orderIdx: index('seed_folders_order_idx').on(table.order),
	})
)

export const seedTemplateNotes = pgTable(
	'seed_template_notes',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		content: text('content').notNull(), // BlockNote JSON
		parentFolderId: text('parent_folder_id'),
		pinned: integer('pinned').default(0),
		order: integer('order').default(0).notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
	},
	(table) => ({
		parentFolderIdx: index('seed_notes_parent_idx').on(table.parentFolderId),
		orderIdx: index('seed_notes_order_idx').on(table.order),
	})
)

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type SeedTemplateFolder = typeof seedTemplateFolders.$inferSelect;
export type NewSeedTemplateFolder = typeof seedTemplateFolders.$inferInsert;
export type SeedTemplateNote = typeof seedTemplateNotes.$inferSelect;
export type NewSeedTemplateNote = typeof seedTemplateNotes.$inferInsert;
