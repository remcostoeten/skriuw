'use server'

import { getDatabase, activityEvents } from '@skriuw/db'
import { requireAuth } from '@/features/authentication/require-auth'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import type { RecentActivityItem, RecentActivityGroup } from '../../types'

/**
 * Fetches recent activity for the current user.
 * Returns activities grouped by date for easy display.
 */
export async function getRecentActivity(options?: {
    limit?: number
    startDate?: string // YYYY-MM-DD filter
    endDate?: string
}): Promise<RecentActivityGroup[]> {
    const user = await requireAuth()
    const db = getDatabase()

    const limit = options?.limit || 50

    // Build where conditions
    const conditions = [eq(activityEvents.userId, user.id)]

    if (options?.startDate) {
        const start = new Date(options.startDate)
        start.setHours(0, 0, 0, 0)
        conditions.push(gte(activityEvents.createdAt, start.getTime()))
    }

    if (options?.endDate) {
        const end = new Date(options.endDate)
        end.setHours(23, 59, 59, 999)
        conditions.push(lte(activityEvents.createdAt, end.getTime()))
    }

    const results = await db
        .select()
        .from(activityEvents)
        .where(and(...conditions))
        .orderBy(desc(activityEvents.createdAt))
        .limit(limit)

    // Group by date
    const groupMap = new Map<string, RecentActivityItem[]>()

    for (const row of results) {
        const date = new Date(row.createdAt).toISOString().split('T')[0]
        const item: RecentActivityItem = {
            id: row.id,
            entityType: row.entityType,
            entityId: row.entityId,
            action: row.action,
            entityName: row.entityName,
            createdAt: row.createdAt,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        }

        const existing = groupMap.get(date)
        if (existing) {
            existing.push(item)
        } else {
            groupMap.set(date, [item])
        }
    }

    // Convert to array sorted by date (most recent first)
    const groups: RecentActivityGroup[] = Array.from(groupMap.entries())
        .map(([date, items]) => ({ date, items }))
        .sort((a, b) => b.date.localeCompare(a.date))

    return groups
}

/**
 * Fetches activity for a specific entity.
 * Useful for showing activity history on a note's detail page.
 */
export async function getEntityActivity(entityType: string, entityId: string): Promise<RecentActivityItem[]> {
    const user = await requireAuth()
    const db = getDatabase()

    const results = await db
        .select()
        .from(activityEvents)
        .where(
            and(
                eq(activityEvents.userId, user.id),
                eq(activityEvents.entityType, entityType as 'note' | 'folder' | 'task'),
                eq(activityEvents.entityId, entityId)
            )
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(20)

    return results.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        entityName: row.entityName,
        createdAt: row.createdAt,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
}
