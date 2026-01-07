export type UUID = string
export type Timestamp = number

export type BaseEntity = {
    id: UUID
} & {
    createdAt: Timestamp
    updatedAt: Timestamp
    deletedAt?: Timestamp
}

export interface Task extends BaseEntity {
    noteId: UUID
    blockId: string
    content: string
    checked: number // 0 or 1
    parentTaskId: UUID | null
    position: number
}
