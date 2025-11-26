import { integer, text } from "drizzle-orm/sqlite-core";

import type { Time, UUID } from "@/shared/types/semantic";

/**
 * Schema helpers for Drizzle ORM.
 * 
 * These helpers extract common patterns (timestamps, IDs) into reusable
 * functions, making schema definitions cleaner and more consistent.
 */

export interface TimestampsSchemaOptions {
	withDeleted?: boolean;
}

/**
 * Creates timestamp columns (createdAt, updatedAt) with semantic types.
 * Optionally includes deletedAt for soft-delete patterns.
 */
export function timestampsSchema(opts?: TimestampsSchemaOptions) {
	return {
		createdAt: integer("created_at", { mode: "number" })
			.notNull()
			.$type<Time>(),
		updatedAt: integer("updated_at", { mode: "number" })
			.notNull()
			.$type<Time>(),
		...(opts?.withDeleted
			? {
					deletedAt: integer("deleted_at", { mode: "number" })
						.$type<Time>()
				}
			: {})
	};
}

/**
 * Creates a base entity schema with ID and timestamps.
 * This is the foundation for most database tables.
 */
export function baseEntitySchema(opts?: TimestampsSchemaOptions) {
	return {
		id: text("id").primaryKey().$type<UUID>(),
		...timestampsSchema(opts)
	};
}

/**
 * Creates a foreign key reference with semantic UUID type.
 */
export function foreignKey(
	columnName: string,
	tableName: string,
	options?: {
		onDelete?: "cascade" | "set null" | "restrict";
		notNull?: boolean;
	}
) {
	const column = text(columnName).$type<UUID>();
	
	if (options?.notNull) {
		column.notNull();
	}
	
	// Note: The actual reference will be added in the table definition
	// This is just a helper for the column definition
	return column;
}

