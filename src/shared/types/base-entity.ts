/**
 * Base entity interface for database entities
 * All entities should have these fields
 */
export type Entity = {
	id: string
	createdAt: number
	updatedAt: number
}


