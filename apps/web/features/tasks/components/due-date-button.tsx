'use client'

import {
	parseDate,
	CalendarDate,
	getLocalTimeZone,
	today,
	DateValue
} from '@internationalized/date'
import { cn } from '@skriuw/shared'
import { Button } from '@skriuw/ui/button'
import { Calendar } from '@skriuw/ui/calendar-rac'
import { Popover, PopoverContent, PopoverTrigger } from '@skriuw/ui/popover'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { useState } from 'react'

type DueDateButtonProps = {
	dueDate: number | null
	onUpdate: (dueDate: number | null) => void
	className?: string
}

function formatDueDate(timestamp: number): string {
	const date = new Date(timestamp)
	const now = new Date()
	const tomorrow = new Date(now)
	tomorrow.setDate(tomorrow.getDate() + 1)

	if (
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate()
	) {
		return 'Today'
	}

	if (
		date.getFullYear() === tomorrow.getFullYear() &&
		date.getMonth() === tomorrow.getMonth() &&
		date.getDate() === tomorrow.getDate()
	) {
		return 'Tomorrow'
	}

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDueDateColor(timestamp: number | null): string {
	if (!timestamp) return 'text-muted-foreground'

	const date = new Date(timestamp)
	const now = new Date()
	now.setHours(0, 0, 0, 0)
	date.setHours(0, 0, 0, 0)

	if (date < now) return 'text-red-400'
	if (date.getTime() === now.getTime()) return 'text-orange-400'
	return 'text-blue-400'
}

function timestampToCalendarDate(timestamp: number): CalendarDate {
	const date = new Date(timestamp)
	return parseDate(
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
	)
}

function calendarDateToTimestamp(calendarDate: CalendarDate): number {
	const date = calendarDate.toDate(getLocalTimeZone())
	date.setHours(23, 59, 59, 999)
	return date.getTime()
}

export function DueDateButton({ dueDate, onUpdate, className }: DueDateButtonProps) {
	const [open, setOpen] = useState(false)

	const selectedDate = dueDate ? timestampToCalendarDate(dueDate) : null

	function handleChange(value: DateValue) {
		if (value) {
			// value can be CalendarDate, CalendarDateTime, or ZonedDateTime.
			// Since we are using simple date picker, it usually returns CalendarDate.
			// But to be safe and satisfy TS, we treat it as DateValue which has toDate().
			// But helper needs CalendarDate.
			// Let's rely on basic CalendarDate casting if possible, or convert DateValue to CalendarDate.
			// Actually `Calendar` from RAC returns what you give it or CalendarDate by default.
			// Let's try casting for now as it's the simplest path given previous code.
			onUpdate(calendarDateToTimestamp(value as CalendarDate))
		}
		setOpen(false)
	}

	function handleClear(e: React.MouseEvent) {
		e.stopPropagation()
		onUpdate(null)
		setOpen(false)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant='ghost'
					size='sm'
					className={cn(
						'h-7 gap-1.5 px-2 text-xs font-normal rounded-full',
						'hover:bg-muted/80 transition-colors',
						getDueDateColor(dueDate),
						className
					)}
				>
					<CalendarIcon className='h-3.5 w-3.5' />
					<span>{dueDate ? formatDueDate(dueDate) : 'Due date'}</span>
					{dueDate && (
						<span
							role='button'
							onClick={handleClear}
							className='ml-0.5 p-0.5 rounded-full hover:bg-muted-foreground/20'
						>
							<X className='h-3 w-3' />
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className='w-auto p-3' align='start'>
				<Calendar
					value={selectedDate}
					onChange={handleChange}
					minValue={today(getLocalTimeZone())}
				/>
			</PopoverContent>
		</Popover>
	)
}
