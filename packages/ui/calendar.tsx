'use client'

import { Calendar as CalendarRAC, CalendarProps as CalendarRACProps } from './calendar-rac'
import * as React from 'react'

export type CalendarProps = CalendarRACProps

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(({ className, ...props }, ref) => {
	return (
		<CalendarRAC
			ref={ref}
			className={`rounded-lg border border-border bg-popover p-3 shadow-sm ${className || ''}`}
			{...props}
		/>
	)
})

Calendar.displayName = 'Calendar'

export { Calendar }
