import type { ReactNode } from 'react';

declare global {
    /**
     * React component children type.
     * This type can be used without explicit imports throughout the application.
     *
     * @example
     * type ComponentProps = {
     *   children: Children;
     * }
     */
    type Children = ReactNode;
    type Node = ReactNode;

    /**
     * Nullable type.
     * Allows a value to be `null` or `undefined`.
     *
     * @example
     * type User = {
     *   name: string;
     *   email: string;
     * };
     * type NullableUser = Nullable<User>;
     */
    type Nullable<T> = T | null | undefined;

    /**
     * Optional type.
     * Expresses that a value may be `undefined` but not `null`.
     *
     * @example
     * type WithOptionalName = {
     *   name: Optional<string>;
     * };
     */
    type Optional<T> = T | undefined;

    /**
     * Positionable type.
     * Provides a numeric position for ordering.
     *
     * @example
     * type PositionedItem = Positionable & { id: UUID };
     */
    type Positionable = {
        position: number;
    };

    /**
     * Generic database or entity identifier.
     * May be numeric or string-based depending on source.
     */
    type ID = string | number;

    /**
     * Universally Unique Identifier (UUID).
     * Always a string, typically generated via crypto.randomUUID().
     */
    type UUID = string;

    /**
     * A general identifier type that can represent an ID or UUID.
     */
    type Identifier = ID | UUID;

    /**
     * Millisecond timestamp (Unix epoch).
     * Stored as a number throughout the application.
     */
    type Timestamp = number;

    /**
     * Standard timestamp fields for entities.
     * Pass `true` to include `deletedAt`, or omit for default (no `deletedAt`).
     *
     * @example
     * type User = Timestamps;
     * type Post = Timestamps<true>;
     */
    type Timestamps<WithDeletedAt extends boolean = false> =
        WithDeletedAt extends true
        ? {
            createdAt: Timestamp;
            updatedAt: Timestamp;
            deletedAt?: Timestamp | null;
        }
        : {
            createdAt: Timestamp;
            updatedAt: Timestamp;
        };

    /**
     * Base entity type for all persisted records.
     * Includes an identifier and timestamp fields.
     * Pass `true` to include `deletedAt` for soft-deletable entities.
     *
     * @example
     * type User = BaseEntity;
     * type SoftDeletable = BaseEntity<true>;
     */
    type BaseEntity<WithDeletedAt extends boolean = false> = {
        id: Identifier;
    } & Timestamps<WithDeletedAt>;
}

export { };
