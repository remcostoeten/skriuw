export type UUID = string
export type Timestamp = number

export type BaseEntity = {
    id: UUID
} & {
    createdAt: Timestamp
    updatedAt: Timestamp
    deletedAt?: Timestamp
}
