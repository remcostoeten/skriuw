/**
 * Semantic types for better type safety and code clarity.
 * 
 * Instead of using generic types like `string` or `number`, we use
 * semantic types that clearly express intent. This makes code
 * self-documenting and prevents common mistakes.
 */

/**
 * UUID type for unique identifiers.
 * Represents a universally unique identifier (typically v4 UUID).
 */
export type UUID = string & { readonly __brand: 'UUID' }

/**
 * Time type for timestamps.
 * Represents milliseconds since Unix epoch (number).
 */
export type Time = number & { readonly __brand: 'Time' }

/**
 * Type guard/assertion helpers for semantic types.
 * These allow safe conversion between string/number and semantic types.
 */

/**
 * Converts a string to UUID type. Use when you're certain the string is a valid UUID.
 */
export function asUUID(value: string): UUID {
	return value as UUID;
}

/**
 * Converts a number to Time type. Use for timestamps.
 */
export function asTime(value: number): Time {
	return value as Time;
}

/**
 * Base entity interface with semantic types.
 * All database entities should extend this.
 */
export interface BaseEntity {
	id: UUID
	createdAt: Time
	updatedAt: Time
}

/**
 * Timestamps interface for entities that track creation and update times.
 */
export interface Timestamps {
	createdAt: Time
	updatedAt: Time
}

/**
 * Optional deleted timestamp for soft-delete patterns.
 */
export interface SoftDelete {
	deletedAt?: Time
}

