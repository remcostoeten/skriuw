'use client'

import { getCalendarData } from "../api/queries/get-calendar-data";
import { getRecentActivity } from "../api/queries/get-recent-activity";
import type { CalendarData, RecentActivityGroup } from "../types";
import { ActivityCalendar } from "./activity-calendar";
import { RecentActivityList } from "./recent-activity-list";
import { useState, useEffect, useCallback } from "react";

type ActivityPanelProps = {
	className?: string
}

/**
 * Combined panel showing the contribution calendar and recent activity.
 * This is the main activity view component.
 */
export function ActivityPanel({ className = '' }: ActivityPanelProps) {
	const [calendarData, setCalendarData] = useState<CalendarData | null>(null)
	const [activityGroups, setActivityGroups] = useState<RecentActivityGroup[]>([])
	const [selectedDate, setSelectedDate] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Load initial data
	useEffect(() => {
		async function loadData() {
			try {
				setIsLoading(true)
				setError(null)

				const [calendar, recent] = await Promise.all([
					getCalendarData(365),
					getRecentActivity({ limit: 30 })
				])

				setCalendarData(calendar)
				setActivityGroups(recent)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load activity')
			} finally {
				setIsLoading(false)
			}
		}

		loadData()
	}, [])

	// Handle calendar day click - filter activity by date
	const handleDayClick = useCallback(async (date: string) => {
		setSelectedDate(date)
		setIsLoading(true)

		try {
			const activity = await getRecentActivity({
				startDate: date,
				endDate: date,
				limit: 50
			})
			setActivityGroups(activity)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load activity')
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Clear date filter
	const handleClearFilter = useCallback(async () => {
		setSelectedDate(null)
		setIsLoading(true)

		try {
			const recent = await getRecentActivity({ limit: 30 })
			setActivityGroups(recent)
		} catch {
			// Ignore
		} finally {
			setIsLoading(false)
		}
	}, [])

	if (error) {
		return (
			<div
				className={`flex flex-col items-center justify-center py-12 text-red-400 ${className}`}
			>
				<p className='font-medium'>Error loading activity</p>
				<p className='text-sm text-zinc-500'>{error}</p>
			</div>
		)
	}

	return (
		<div className={`flex flex-col gap-8 ${className}`}>
			{/* Header */}
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-bold text-zinc-100'>Activity</h1>
				<p className='text-zinc-400'>
					{calendarData?.totalActivities || 0} activities in the last year
				</p>
			</div>

			{/* Calendar */}
			<div className='relative p-6 bg-zinc-900/50 rounded-xl border border-zinc-800'>
				{isLoading && !calendarData ? (
					<div className='h-32 flex items-center justify-center'>
						<div className='w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin' />
					</div>
				) : calendarData ? (
					<ActivityCalendar days={calendarData.days} onDayClick={handleDayClick} />
				) : null}
			</div>

			{/* Activity feed */}
			<div className='flex flex-col gap-4'>
				<div className='flex items-center justify-between'>
					<h2 className='text-lg font-semibold text-zinc-200'>
						{selectedDate
							? `Activity on ${formatDate(selectedDate)}`
							: 'Recent Activity'}
					</h2>
					{selectedDate && (
						<button
							onClick={handleClearFilter}
							className='text-sm text-zinc-400 hover:text-zinc-200 transition-colors'
						>
							Clear filter
						</button>
					)}
				</div>

				<RecentActivityList groups={activityGroups} isLoading={isLoading} />
			</div>
		</div>
	)
}

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	})
}
