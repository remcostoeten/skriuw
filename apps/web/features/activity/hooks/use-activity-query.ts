import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/auth-client'
import { getRecentActivity, getEntityActivity } from '../api/queries/get-recent-activity'
import { getCalendarData } from '../api/queries/get-calendar-data'
import type { RecentActivityGroup, RecentActivityItem } from '../types'

export const activityKeys = {
    all: ['activity'] as const,
    recent: (limit?: number) => [...activityKeys.all, 'recent', { limit }] as const,
    entity: (entityType: string, entityId: string) => [...activityKeys.all, 'entity', entityType, entityId] as const,
    calendar: (days?: string) => [...activityKeys.all, 'calendar', { days }] as const,
}

/**
 * Query hook for fetching recent activity grouped by date
 */
export function useRecentActivityQuery(options?: { limit?: number; startDate?: string; endDate?: string }) {
    const { data: session } = useSession()
    const limit = options?.limit ?? 50

    return useQuery({
        queryKey: activityKeys.recent(limit),
        queryFn: async () => {
            return await getRecentActivity(options)
        },
        enabled: !!session?.user,
        staleTime: 1000 * 30, // 30 seconds - activity changes frequently
    })
}

/**
 * Query hook for fetching activity for a specific entity
 */
export function useEntityActivityQuery(entityType: string, entityId: string) {
    const { data: session } = useSession()

    return useQuery({
        queryKey: activityKeys.entity(entityType, entityId),
        queryFn: async () => {
            return await getEntityActivity(entityType, entityId)
        },
        enabled: !!session?.user && !!entityType && !!entityId,
        staleTime: 1000 * 60, // 1 minute
    })
}

/**
 * Query hook for fetching calendar heatmap data
 */
export function useCalendarActivityQuery(days: number = 365) {
    const { data: session } = useSession()

    return useQuery({
        queryKey: activityKeys.calendar(String(days)),
        queryFn: async () => {
            return await getCalendarData(days)
        },
        enabled: !!session?.user,
        staleTime: 1000 * 60 * 5, // 5 minutes - calendar data less volatile
    })
}
