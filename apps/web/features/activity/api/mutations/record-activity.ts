'use server'

import { getDatabase, activityEvents } from '@skriuw/db'
import { requireAuth } from '@/features/authentication/require-auth'
import type { RecordActivityInput } from '../../types'

/**
 * Records an activity event for the current user.
 * This should be called after successful CRUD operations on entities.
 */
export async function recordActivity(input: RecordActivityInput): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await requireAuth()
        const db = getDatabase()

        const id = `activity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const now = Date.now()

        await db.insert(activityEvents).values({
            id,
            userId: user.id,
            entityType: input.entityType,
            entityId: input.entityId,
            action: input.action,
            entityName: input.entityName,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            createdAt: now
        })

        return { success: true }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        if (errorMessage !== 'Authentication required') {
            console.error('Failed to record activity:', error)
        }
        return { success: false, error: errorMessage }
    }
}

/**
 * Records multiple activity events in a batch.
 * Useful for bulk operations like moving multiple items.
 */
export async function recordActivities(inputs: RecordActivityInput[]): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await requireAuth()
        const db = getDatabase()
        const now = Date.now()

        const values = inputs.map((input, idx) => ({
            id: `activity_${now}_${idx}_${Math.random().toString(36).slice(2, 9)}`,
            userId: user.id,
            entityType: input.entityType,
            entityId: input.entityId,
            action: input.action,
            entityName: input.entityName,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            createdAt: now + idx // Slight offset for ordering
        }))

        await db.insert(activityEvents).values(values)

        return { success: true }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        if (errorMessage !== 'Authentication required') {
            console.error('Failed to record activities:', error)
        }
        return { success: false, error: errorMessage }
    }
}
