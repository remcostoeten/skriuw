import type { UUID, Timestamp } from './semantics'

/**
 * Core entity time metadata.
 * Includes creation, update, and optional deletion timestamp.
 */
type Timestamps = {
    createdAt: Timestamp
    updatedAt: Timestamp
    deletedAt?: Timestamp
}

/**
 * Base entity shape that all domain models extend.
 * Aligns with database schema and CRUD package.
 */
export type BaseEntity = {
    id: UUID
} & Timestamps

