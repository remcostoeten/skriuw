import { pgTable, text, integer, bigint, index } from 'drizzle-orm/pg-core'
import { createUserIndex, createUserCompositeIndex } from '../user-owned'
import { user } from './auth'

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
        noteBlockIdx: index('tasks_note_block_idx').on(table.noteId, table.blockId),
        dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
        userIdx: createUserIndex('tasks', table.userId),
        userNoteIdx: createUserCompositeIndex('tasks', 'note', table.userId, table.noteId)
    })
)

export type Task = typeof tasks.$inferSelect
