import { z } from 'zod'
import { MAX_TASK_CONTENT_LENGTH, MAX_TASK_DESCRIPTION_LENGTH } from '../rules'

const TimestampSchema = z.number().int().nonnegative()

export const TaskCheckedSchema = z.union([z.literal(0), z.literal(1)])

export const TaskSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
  noteName: z.string().nullable().optional(),
  blockId: z.string().min(1),
  content: z.string().max(MAX_TASK_CONTENT_LENGTH),
  description: z.string().max(MAX_TASK_DESCRIPTION_LENGTH).nullable().optional(),
  checked: TaskCheckedSchema,
  dueDate: TimestampSchema.nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  position: z.number().int(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
})

export const TaskCreateSchema = z.object({
  noteId: z.string().min(1),
  blockId: z.string().min(1),
  content: z.string().trim().min(1).max(MAX_TASK_CONTENT_LENGTH),
  description: z.string().max(MAX_TASK_DESCRIPTION_LENGTH).nullable().optional(),
  checked: z.union([z.boolean(), TaskCheckedSchema]).optional(),
  dueDate: TimestampSchema.nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  position: z.number().int().optional()
})

export const TaskUpdateSchema = z.object({
  content: z.string().trim().min(1).max(MAX_TASK_CONTENT_LENGTH).optional(),
  description: z.string().max(MAX_TASK_DESCRIPTION_LENGTH).nullable().optional(),
  checked: z.union([z.boolean(), TaskCheckedSchema]).optional(),
  dueDate: TimestampSchema.nullable().optional(),
  updatedAt: TimestampSchema.optional()
})

export const TaskSyncItemSchema = z.object({
  blockId: z.string().min(1),
  content: z.string().max(MAX_TASK_CONTENT_LENGTH),
  checked: z.boolean(),
  parentTaskId: z.string().nullable(),
  position: z.number().int().optional()
})

export const TaskSyncPayloadSchema = z.object({
  noteId: z.string().min(1),
  tasks: z.array(TaskSyncItemSchema).default([])
})

export type Task = z.infer<typeof TaskSchema>
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>
export type TaskSyncItem = z.infer<typeof TaskSyncItemSchema>
export type TaskSyncPayload = z.infer<typeof TaskSyncPayloadSchema>
