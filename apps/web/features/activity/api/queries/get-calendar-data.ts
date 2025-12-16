'use server'

import { getDatabase, activityEvents } from '@skriuw/db'
import { requireAuth } from '@/features/authentication/require-auth'
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm'
import type { CalendarData, CalendarDay } from '../../types'

/**
 * Fetches activity counts grouped by day for the contribution calendar.
 * Returns data for the last 365 days by default.
 */
export async function getCalendarData(days: number = 365): Promise<CalendarData> {
    const user = await requireAuth()
    const db = getDatabase()

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const startTimestamp = startDate.setHours(0, 0, 0, 0)
    const endTimestamp = endDate.setHours(23, 59, 59, 999)

    // Query activity counts grouped by day
    const results = await db
        .select({
            // Convert timestamp to date string for grouping
            date: sql<string>`TO_CHAR(TO_TIMESTAMP(${activityEvents.createdAt} / 1000), 'YYYY-MM-DD')`,
            count: sql<number>`COUNT(*)::int`
        })
        .from(activityEvents)
        .where(
            and(
                eq(activityEvents.userId, user.id),
                gte(activityEvents.createdAt, startTimestamp),
                lte(activityEvents.createdAt, endTimestamp)
            )
        )
        .groupBy(sql`TO_CHAR(TO_TIMESTAMP(${activityEvents.createdAt} / 1000), 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(TO_TIMESTAMP(${activityEvents.createdAt} / 1000), 'YYYY-MM-DD')`)

    // Create a map of date -> count
    const countMap = new Map<string, number>()
    let totalActivities = 0
    for (const row of results) {
        countMap.set(row.date, row.count)
        totalActivities += row.count
    }

    // Calculate intensity levels based on activity distribution
    const counts = results.map((r) => r.count)
    const maxCount = Math.max(...counts, 1)

    // Generate all days in range with their activity levels
    const calendarDays: CalendarDay[] = []
    const current = new Date(startDate)
    current.setHours(0, 0, 0, 0)

    while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0]
        const count = countMap.get(dateStr) || 0

        // Calculate intensity level (0-4)
        let level: 0 | 1 | 2 | 3 | 4 = 0
        if (count > 0) {
            const ratio = count / maxCount
            if (ratio <= 0.25) level = 1
            else if (ratio <= 0.5) level = 2
            else if (ratio <= 0.75) level = 3
            else level = 4
        }

        calendarDays.push({ date: dateStr, count, level })
        current.setDate(current.getDate() + 1)
    }

    return {
        days: calendarDays,
        totalActivities,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    }
}
