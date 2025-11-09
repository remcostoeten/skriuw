'use client'

import type { Task } from '@/api/db/schema'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

type TaskCalendarViewProps = {
	tasks: Task[]
	onTaskClick: (task: Task) => void
}

export function TaskCalendarView({ tasks, onTaskClick }: TaskCalendarViewProps) {
	const [currentDate, setCurrentDate] = useState(new Date())

	const { daysInMonth, firstDayOfMonth, monthName, year } = useMemo(() => {
		const year = currentDate.getFullYear()
		const month = currentDate.getMonth()
		const firstDay = new Date(year, month, 1).getDay()
		const daysInMonth = new Date(year, month + 1, 0).getDate()
		const monthNames = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
		]

		return {
			daysInMonth,
			firstDayOfMonth: firstDay,
			monthName: monthNames[month],
			year
		}
	}, [currentDate])

	const tasksByDate = useMemo(() => {
		const map: Record<string, Task[]> = {}
		
		tasks.forEach(task => {
			if (task.dueAt) {
				const date = new Date(task.dueAt)
				const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
				if (!map[key]) map[key] = []
				map[key].push(task)
			}
		})

		return map
	}, [tasks])

	const goToPreviousMonth = () => {
		setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
	}

	const goToNextMonth = () => {
		setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
	}

	const goToToday = () => {
		setCurrentDate(new Date())
	}

	const getTasksForDay = (day: number) => {
		const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${day}`
		return tasksByDate[key] || []
	}

	const isToday = (day: number) => {
		const today = new Date()
		return (
			day === today.getDate() &&
			currentDate.getMonth() === today.getMonth() &&
			currentDate.getFullYear() === today.getFullYear()
		)
	}

	// Generate calendar grid
	const calendarDays = []
	for (let i = 0; i < firstDayOfMonth; i++) {
		calendarDays.push(<div key={`empty-${i}`} className="min-h-24 p-2 bg-muted/20" />)
	}
	for (let day = 1; day <= daysInMonth; day++) {
		const dayTasks = getTasksForDay(day)
		const today = isToday(day)
		
		calendarDays.push(
			<CalendarDay
				key={day}
				day={day}
				tasks={dayTasks}
				isToday={today}
				onTaskClick={onTaskClick}
			/>
		)
	}

	return (
		<div className="bg-background/30 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
			{/* Calendar Header */}
			<div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/30">
				<div className="flex items-center gap-3">
					<CalendarIcon className="w-5 h-5 text-muted-foreground" />
					<h2 className="text-xl font-bold text-foreground">
						{monthName} {year}
					</h2>
				</div>
				
				<div className="flex items-center gap-2">
					<Button
						onClick={goToToday}
						variant="outline"
						size="sm"
						className="h-8 text-xs"
					>
						Today
					</Button>
					<Button
						onClick={goToPreviousMonth}
						variant="outline"
						size="sm"
						className="h-8 w-8 p-0"
					>
						<ChevronLeft className="w-4 h-4" />
					</Button>
					<Button
						onClick={goToNextMonth}
						variant="outline"
						size="sm"
						className="h-8 w-8 p-0"
					>
						<ChevronRight className="w-4 h-4" />
					</Button>
				</div>
			</div>

			{/* Calendar Grid */}
			<div className="p-4">
				{/* Weekday Headers */}
				<div className="grid grid-cols-7 gap-2 mb-2">
					{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
						<div
							key={day}
							className="text-center text-xs font-semibold text-muted-foreground py-2"
						>
							{day}
						</div>
					))}
				</div>

				{/* Calendar Days */}
				<div className="grid grid-cols-7 gap-2">
					{calendarDays}
				</div>
			</div>

			{/* Legend */}
			<div className="px-6 py-4 border-t border-border/50 bg-muted/20">
				<div className="flex items-center gap-6 text-xs text-muted-foreground">
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
						<span>Overdue</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-full bg-orange-500/20 border border-orange-500/50" />
						<span>Due Today</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500/50" />
						<span>Upcoming</span>
					</div>
				</div>
			</div>
		</div>
	)
}

type CalendarDayProps = {
	day: number
	tasks: Task[]
	isToday: boolean
	onTaskClick: (task: Task) => void
}

function CalendarDay({ day, tasks, isToday, onTaskClick }: CalendarDayProps) {
	const today = new Date()
	const overdueTasks = tasks.filter(t => !t.completed)
	const completedTasks = tasks.filter(t => t.completed)
	
	const priorityCount = {
		urgent: tasks.filter(t => t.priority === 'urgent' && !t.completed).length,
		high: tasks.filter(t => t.priority === 'high' && !t.completed).length,
		med: tasks.filter(t => t.priority === 'med' && !t.completed).length,
		low: tasks.filter(t => t.priority === 'low' && !t.completed).length
	}

	return (
		<div
			className={`
				min-h-24 p-2 rounded-lg border border-border/50
				bg-background/50 hover:bg-background/80
				transition-all duration-200
				${isToday ? 'ring-2 ring-primary shadow-lg' : ''}
			`}
		>
			{/* Day Number */}
			<div className="flex items-center justify-between mb-2">
				<span className={`
					text-sm font-semibold
					${isToday ? 'text-primary' : 'text-foreground/70'}
				`}>
					{day}
				</span>
				
				{tasks.length > 0 && (
					<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
						{tasks.length}
					</span>
				)}
			</div>

			{/* Tasks */}
			<div className="space-y-1">
				{tasks.slice(0, 3).map(task => (
					<button
						key={task.id}
						onClick={() => onTaskClick(task)}
						className={`
							w-full text-left text-[10px] px-1.5 py-1 rounded
							border-l-2 truncate
							transition-all duration-150
							hover:shadow-sm
							${task.completed 
								? 'bg-muted/50 text-muted-foreground border-l-gray-400 line-through' 
								: getPriorityClasses(task.priority)
							}
						`}
					>
						{stripHtml(task.content)}
					</button>
				))}
				
				{tasks.length > 3 && (
					<div className="text-[10px] text-center text-muted-foreground py-1">
						+{tasks.length - 3} more
					</div>
				)}
			</div>

			{/* Priority Indicators */}
			{tasks.length > 0 && (
				<div className="flex gap-1 mt-2">
					{priorityCount.urgent > 0 && (
						<div className="w-1.5 h-1.5 rounded-full bg-red-500" title={`${priorityCount.urgent} urgent`} />
					)}
					{priorityCount.high > 0 && (
						<div className="w-1.5 h-1.5 rounded-full bg-orange-500" title={`${priorityCount.high} high`} />
					)}
					{priorityCount.med > 0 && (
						<div className="w-1.5 h-1.5 rounded-full bg-yellow-500" title={`${priorityCount.med} medium`} />
					)}
				</div>
			)}
		</div>
	)
}

function getPriorityClasses(priority: string) {
	const classes = {
		urgent: 'bg-red-500/10 border-l-red-500 text-red-600 dark:text-red-400',
		high: 'bg-orange-500/10 border-l-orange-500 text-orange-600 dark:text-orange-400',
		med: 'bg-yellow-500/10 border-l-yellow-500 text-yellow-600 dark:text-yellow-400',
		low: 'bg-blue-500/10 border-l-blue-500 text-blue-600 dark:text-blue-400'
	}
	return classes[priority as keyof typeof classes] || classes.med
}

function stripHtml(html: string): string {
	const tmp = document.createElement('div')
	tmp.innerHTML = html
	return tmp.textContent || tmp.innerText || ''
}
