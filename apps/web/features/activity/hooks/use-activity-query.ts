import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/auth-client'
import { getRecentActivity, getEntityActivity } from '../api/queries/get-recent-activity'
import { getCalendarData } from '../api/queries/get-calendar-data'
import type { RecentActivityGroup, RecentActivityItem } from '../types'

type RecentActivityOptions = { limit?: number; startDate?: string; endDate?: string }

export const activityKeys = {
    all: ['activity'] as const,
    recent: (options?: RecentActivityOptions) => [...activityKeys.all, 'recent', options] as const,
    entity: (entityType: string, entityId: string) => [...activityKeys.all, 'entity', entityType, entityId] as const,
    calendar: (days?: number) => [...activityKeys.all, 'calendar', { days }] as const,
}

export function useRecentActivityQuery(options?: RecentActivityOptions) {
    const { data: session } = useSession()

    return useQuery({
        queryKey: activityKeys.recent(options),
        queryFn: async () => {
            return await getRecentActivity(options)
        },
        enabled: !!session?.user,
        staleTime: 1000 * 30,
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
        queryKey: activityKeys.calendar(days),
        queryFn: async () => {
            return await getCalendarData(days)
        },
        enabled: !!session?.user,
        staleTime: 1000 * 60 * 5,
    })
}
