/**
 * Base entity interface for database entities
 * All entities should have these fields
 */
export interface BaseEntity {
	id: string
	createdAt: number
	updatedAt: number
}


