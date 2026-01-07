export type { BaseEntity, Timestamp, UUID } from '@/types/common'

export type { Task } from '@skriuw/db'

export interface TaskWithNote extends Omit<import('@skriuw/db').Task, 'userId'> {
    noteName: string | null
    userId?: string | null
}
