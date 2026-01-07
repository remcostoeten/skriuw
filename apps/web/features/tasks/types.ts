export type UUID = string
export type Timestamp = number

export type BaseEntity = {
    id: UUID
} & {
    createdAt: Timestamp
    updatedAt: Timestamp
    deletedAt?: Timestamp
}

export type { Task } from '@skriuw/db'

export interface TaskWithNote extends Omit<import('@skriuw/db').Task, 'userId'> {
    noteName: string | null
    userId?: string | null
}
