'use client'

import type { CalendarDay } from '../types'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@skriuw/ui'
import { useMemo } from 'react'

type ActivityCalendarProps = {
	days: CalendarDay[]
	onDayClick?: (date: string) => void
	className?: string
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LEVEL_COLORS = {
	0: 'bg-zinc-800/50',
	1: 'bg-emerald-900/60',
	2: 'bg-emerald-700/70',
	3: 'bg-emerald-500/80',
	4: 'bg-emerald-400'
} as const

/**
 * GitHub-style contribution calendar showing activity over time.
 * Displays a heatmap of daily activity with intensity levels.
 */
export function ActivityCalendar({ days, onDayClick, className = '' }: ActivityCalendarProps) {
	// Organize days into weeks (7 days each, starting from Sunday)
	const { weeks, monthLabels } = useMemo(() => {
		if (!days.length) return { weeks: [], monthLabels: [] }

		// Create a map for quick lookup
		const dayMap = new Map(days.map((d) => [d.date, d]))

		// Find the first Sunday on or before the start date
		const firstDate = new Date(days[0].date)
		const dayOfWeek = firstDate.getDay()
		const startDate = new Date(firstDate)
		startDate.setDate(startDate.getDate() - dayOfWeek)

		// Generate weeks
		const weeksArr: (CalendarDay | null)[][] = []
		const monthLabelsArr: { month: string; weekIndex: number }[] = []
		let currentDate = new Date(startDate)
		let lastMonth = -1

		// Generate 53 weeks to cover a full year
		const endDate = new Date(days[days.length - 1].date)
		endDate.setDate(endDate.getDate() + 7) // Extend a bit

		while (currentDate <= endDate) {
			const week: (CalendarDay | null)[] = []

			for (let day = 0; day < 7; day++) {
				const dateStr = currentDate.toISOString().split('T')[0]
				const calDay = dayMap.get(dateStr)

				if (calDay) {
					week.push(calDay)
				} else {
					// Outside our data range
					week.push(null)
				}

				// Track month labels
				const month = currentDate.getMonth()
				if (month !== lastMonth && day === 0) {
					monthLabelsArr.push({
						month: MONTHS[month],
						weekIndex: weeksArr.length
					})
					lastMonth = month
				}

				currentDate.setDate(currentDate.getDate() + 1)
			}

			weeksArr.push(week)
		}

		return { weeks: weeksArr, monthLabels: monthLabelsArr }
	}, [days])

	if (!days.length) {
		return (
			<div className={`flex items-center justify-center p-8 text-zinc-500 ${className}`}>
				No activity data available
			</div>
		)
	}

	return (
		<div className={`flex flex-col gap-2 ${className}`}>
			{/* Month labels */}
			<div className='flex gap-[3px] pl-8 text-xs text-zinc-500'>
				{monthLabels.map(({ month, weekIndex }, idx) => (
					<div
						key={`${month}-${idx}`}
						className='absolute'
						style={{ left: weekIndex * 15 + 32 }}
					>
						{month}
					</div>
				))}
			</div>

			<div className='flex gap-1'>
				{/* Day labels */}
				<div className='flex flex-col gap-[3px] text-xs text-zinc-500 pr-2'>
					{DAYS_OF_WEEK.map((day, idx) => (
						<div
							key={day}
							className='h-[11px] leading-[11px]'
							style={{ visibility: idx % 2 === 1 ? 'visible' : 'hidden' }}
						>
							{day}
						</div>
					))}
				</div>

				{/* Calendar grid */}
				<TooltipProvider delayDuration={0}>
					<div className='flex gap-[3px]'>
						{weeks.map((week, weekIdx) => (
							<div key={weekIdx} className='flex flex-col gap-[3px]'>
								{week.map((day, dayIdx) => {
									if (!day) {
										return (
											<div
												key={`empty-${dayIdx}`}
												className='w-[11px] h-[11px] rounded-sm bg-transparent'
											/>
										)
									}

									return (
										<Tooltip key={day.date}>
											<TooltipTrigger asChild>
												<button
													onClick={() => onDayClick?.(day.date)}
													className={`w-[11px] h-[11px] rounded-sm transition-all hover:ring-1 hover:ring-zinc-500 ${LEVEL_COLORS[day.level]}`}
													aria-label={`${day.count} activities on ${day.date}`}
												/>
											</TooltipTrigger>
											<TooltipContent side='top' className='text-xs'>
												<p className='font-medium'>
													{day.count}{' '}
													{day.count === 1 ? 'activity' : 'activities'}
												</p>
												<p className='text-zinc-400'>
													{formatDate(day.date)}
												</p>
											</TooltipContent>
										</Tooltip>
									)
								})}
							</div>
						))}
					</div>
				</TooltipProvider>
			</div>

			{/* Legend */}
			<div className='flex items-center gap-2 justify-end text-xs text-zinc-500'>
				<span>Less</span>
				{([0, 1, 2, 3, 4] as const).map((level) => (
					<div
						key={level}
						className={`w-[11px] h-[11px] rounded-sm ${LEVEL_COLORS[level]}`}
					/>
				))}
				<span>More</span>
			</div>
		</div>
	)
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr)
	return date.toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	})
}
