'use client'

import type { Task } from '@/api/db/schema'
import { TaskSidebar } from '@/components/tasks/task-sidebar'
import { useCreateTask } from '@/modules/tasks/api/mutations/create'
import { useGetAllTasks } from '@/modules/tasks/api/queries/get-all-tasks'
import { TaskList } from '@/modules/tasks/components/task-list'
import { applyList } from '@/modules/tasks/utils/saved-filters'
import {
	filterTasks,
	sortTasks,
	TaskFilter,
	TaskSort
} from '@/modules/tasks/utils/sort-filter'
import { BaseActionBar } from '@/shared/components/base-action-bar'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/shared/components/ui/select'
import { DockManager } from '@/utils/dock-utils'
import { 
	CheckSquare2, 
	Filter, 
	LayoutList, 
	LayoutGrid, 
	Calendar as CalendarIcon,
	Search,
	Plus,
	TrendingUp,
	Clock,
	AlertCircle,
	Zap,
	Target
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { TaskBoardView } from '@/modules/tasks/components/task-board-view'
import { TaskCalendarView } from '@/modules/tasks/components/task-calendar-view'
import { TaskDetailModal } from '@/modules/tasks/components/task-detail-modal'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'

type ViewMode = 'list' | 'board' | 'calendar'

export function TasksView() {
	const { createTask } = useCreateTask()
	const { tasks: allTasks, isLoading: tasksLoading } = useGetAllTasks()

	const [selectedQuickFilter, setSelectedQuickFilter] = useState<string | null>(null)
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
	const [priorityFilter, setPriorityFilter] = useState<Task['priority'] | 'all'>('all')
	const [statusFilter, setStatusFilter] = useState<Task['status'] | 'all'>('all')
	const [sortBy, setSortBy] = useState<TaskSort>('createdAt')
	const [showCompleted, setShowCompleted] = useState(true)
	const [viewMode, setViewMode] = useState<ViewMode>('list')
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedTask, setSelectedTask] = useState<Task | null>(null)

	const isLoading = tasksLoading

	// Filter tasks based on current filters
	const filteredTasks = useMemo(() => {
		let filtered = [...allTasks]

		// Search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(t => 
				t.content.toLowerCase().includes(query) ||
				(t.tags && t.tags.toLowerCase().includes(query))
			)
		}

		if (selectedProjectId) {
			filtered = filtered.filter(t => t.project?.id === selectedProjectId)
		}

		if (selectedQuickFilter && selectedQuickFilter !== 'all') {
			filtered = applyList(filtered, selectedQuickFilter)
		}

		// Apply completion filter
		if (!showCompleted) {
			filtered = filtered.filter(t => !t.completed)
		}

		// Apply status filter
		if (statusFilter !== 'all') {
			filtered = filtered.filter(t => t.status === statusFilter)
		}

		// Apply priority filter
		const taskFilter: TaskFilter = {}
		if (priorityFilter !== 'all') {
			taskFilter.priorities = [priorityFilter]
		}

		filtered = filterTasks(filtered, taskFilter)

		// Only apply sort if not using a quick filter (quick filters have their own sort)
		if (!selectedQuickFilter || selectedQuickFilter === 'all') {
			filtered = sortTasks(filtered, sortBy)
		}

		return filtered
	}, [
		allTasks,
		selectedQuickFilter,
		selectedProjectId,
		priorityFilter,
		statusFilter,
		showCompleted,
		sortBy,
		searchQuery
	])

	// Task statistics
	const stats = useMemo(() => {
		const total = allTasks.length
		const completed = allTasks.filter(t => t.completed).length
		const active = total - completed
		const urgent = allTasks.filter(t => t.priority === 'urgent' && !t.completed).length
		const overdue = allTasks.filter(t => 
			t.dueAt && 
			t.dueAt < Date.now() && 
			!t.completed
		).length
		const dueToday = allTasks.filter(t => {
			if (!t.dueAt || t.completed) return false
			const today = new Date()
			const due = new Date(t.dueAt)
			return due.toDateString() === today.toDateString()
		}).length

		return { total, completed, active, urgent, overdue, dueToday }
	}, [allTasks])

	// Update dock badge with total task count
	useEffect(() => {
		DockManager.setBadge(stats.active || 0)
	}, [stats.active])

	const nextTaskPosition = useMemo(() => {
		if (!filteredTasks || filteredTasks.length === 0) return 0
		return (
			filteredTasks.reduce(
				(max, t) => ((t as any).position > max ? (t as any).position : max),
				0
			) + 1
		)
	}, [filteredTasks])

	async function handleCreateTask() {
		try {
			await createTask({
				content: 'New Task',
				position: nextTaskPosition,
				projectId: selectedProjectId || undefined
			})
		} catch (error) {
			console.error('Failed to create task:', error)
		}
	}

	function handleClearFilters() {
		setSelectedQuickFilter(null)
		setSelectedProjectId(null)
		setPriorityFilter('all')
		setStatusFilter('all')
		setShowCompleted(true)
		setSearchQuery('')
	}

	function handleQuickFilterSelect(filterId: string | null) {
		setSelectedQuickFilter(filterId)
	}

	function handleProjectSelect(projectId: string | null) {
		setSelectedProjectId(projectId)
	}

	const hasActiveFilters = selectedQuickFilter || selectedProjectId || 
		priorityFilter !== 'all' || statusFilter !== 'all' || 
		!showCompleted || searchQuery.trim()

	if (isLoading) {
		return (
			<div className="h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
				<div className="flex flex-col items-center gap-3">
					<div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
					<p className="text-sm text-muted-foreground animate-pulse">Loading tasks...</p>
				</div>
			</div>
		)
	}

	return (
		<div
			className="flex h-screen sm:h-screen bg-gradient-to-br from-background via-background to-muted/20"
			style={{ height: 'calc(100vh - env(safe-area-inset-bottom))' }}
		>
			{/* Task Sidebar */}
			<TaskSidebar
				onFilterSelect={handleQuickFilterSelect}
				onProjectSelect={handleProjectSelect}
				selectedFilterId={selectedQuickFilter}
				selectedProjectId={selectedProjectId}
			/>

			<div className="flex-1 flex flex-col bg-transparent relative sm:ml-[220px] ml-0">
				<BaseActionBar
					buttons={[
						{
							icon: <Plus className="w-[18px] h-[18px]" />,
							tooltip: 'New Task',
							onClick: handleCreateTask
						}
					]}
				/>
				
				<div className="flex-1 relative px-8 py-6 overflow-y-auto scrollbar-content">
					<div className="max-w-7xl mx-auto">
						{/* Header with Stats */}
						<div className="mb-8">
							<div className="flex items-start justify-between mb-6">
								<div>
									<h1 className="text-3xl font-bold mb-2 text-foreground bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
										Tasks & Projects
									</h1>
									<p className="text-sm text-muted-foreground">
										Organize, prioritize, and track your work
									</p>
								</div>
								
								{/* View Mode Switcher */}
								<div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border/50">
									<button
										onClick={() => setViewMode('list')}
										className={`p-2 rounded transition-all ${
											viewMode === 'list' 
												? 'bg-background shadow-sm text-foreground' 
												: 'text-muted-foreground hover:text-foreground'
										}`}
										title="List View"
									>
										<LayoutList className="w-4 h-4" />
									</button>
									<button
										onClick={() => setViewMode('board')}
										className={`p-2 rounded transition-all ${
											viewMode === 'board' 
												? 'bg-background shadow-sm text-foreground' 
												: 'text-muted-foreground hover:text-foreground'
										}`}
										title="Board View"
									>
										<LayoutGrid className="w-4 h-4" />
									</button>
									<button
										onClick={() => setViewMode('calendar')}
										className={`p-2 rounded transition-all ${
											viewMode === 'calendar' 
												? 'bg-background shadow-sm text-foreground' 
												: 'text-muted-foreground hover:text-foreground'
										}`}
										title="Calendar View"
									>
										<CalendarIcon className="w-4 h-4" />
									</button>
								</div>
							</div>

							{/* Stats Cards */}
							<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
								<StatCard
									icon={<Target className="w-4 h-4" />}
									label="Total"
									value={stats.total}
									color="blue"
								/>
								<StatCard
									icon={<TrendingUp className="w-4 h-4" />}
									label="Active"
									value={stats.active}
									color="green"
								/>
								<StatCard
									icon={<CheckSquare2 className="w-4 h-4" />}
									label="Completed"
									value={stats.completed}
									color="purple"
								/>
								<StatCard
									icon={<Zap className="w-4 h-4" />}
									label="Urgent"
									value={stats.urgent}
									color="red"
								/>
								<StatCard
									icon={<AlertCircle className="w-4 h-4" />}
									label="Overdue"
									value={stats.overdue}
									color="orange"
								/>
								<StatCard
									icon={<Clock className="w-4 h-4" />}
									label="Due Today"
									value={stats.dueToday}
									color="yellow"
								/>
							</div>
						</div>

						{/* Search and Filters */}
						<div className="mb-6 space-y-4">
							{/* Search Bar */}
							<div className="relative">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
								<Input
									placeholder="Search tasks by content or tags..."
									value={searchQuery}
									onChange={e => setSearchQuery(e.target.value)}
									className="pl-10 h-11 bg-background/50 border-border/50 focus:border-border"
								/>
							</div>

							{/* Filter Controls */}
							<div className="p-4 bg-background/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
								<div className="flex items-center gap-4 flex-wrap">
									<div className="flex items-center gap-2">
										<Filter className="w-4 h-4 text-muted-foreground" />
										<span className="text-xs font-medium text-muted-foreground">
											Filters:
										</span>
									</div>

									<Select
										value={statusFilter}
										onValueChange={value => setStatusFilter(value as Task['status'] | 'all')}
									>
										<SelectTrigger className="w-36 h-9 text-sm bg-background/50">
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="todo">Todo</SelectItem>
											<SelectItem value="in_progress">In Progress</SelectItem>
											<SelectItem value="blocked">Blocked</SelectItem>
											<SelectItem value="done">Done</SelectItem>
										</SelectContent>
									</Select>

									<Select
										value={priorityFilter}
										onValueChange={value =>
											setPriorityFilter(value as Task['priority'] | 'all')
										}
									>
										<SelectTrigger className="w-36 h-9 text-sm bg-background/50">
											<SelectValue placeholder="All Priorities" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Priorities</SelectItem>
											<SelectItem value="urgent">🔴 Urgent</SelectItem>
											<SelectItem value="high">🟠 High</SelectItem>
											<SelectItem value="med">🟡 Medium</SelectItem>
											<SelectItem value="low">🟢 Low</SelectItem>
										</SelectContent>
									</Select>

									<Select
										value={sortBy}
										onValueChange={value => setSortBy(value as TaskSort)}
									>
										<SelectTrigger className="w-40 h-9 text-sm bg-background/50">
											<SelectValue placeholder="Sort by Created" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="createdAt">Sort by Created</SelectItem>
											<SelectItem value="priority">Sort by Priority</SelectItem>
											<SelectItem value="dueAt">Sort by Due Date</SelectItem>
											<SelectItem value="position">Sort by Position</SelectItem>
										</SelectContent>
									</Select>

									<label className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-background/50 border border-border/30 cursor-pointer hover:border-border/50 transition-colors">
										<input
											type="checkbox"
											checked={showCompleted}
											onChange={e => setShowCompleted(e.target.checked)}
											className="rounded w-4 h-4 cursor-pointer"
										/>
										<span className="text-foreground/80">Show completed</span>
									</label>

									{hasActiveFilters && (
										<Button
											onClick={handleClearFilters}
											variant="ghost"
											size="sm"
											className="text-xs text-muted-foreground hover:text-foreground"
										>
											Clear all filters
										</Button>
									)}
								</div>
							</div>
						</div>

						{/* Task Content - Different Views */}
						<div className="min-h-[400px]">
							{viewMode === 'list' && (
								<TaskList 
									noteId={null} 
									tasks={filteredTasks}
									onTaskClick={setSelectedTask}
								/>
							)}
							{viewMode === 'board' && (
								<TaskBoardView 
									tasks={filteredTasks}
									onTaskClick={setSelectedTask}
								/>
							)}
							{viewMode === 'calendar' && (
								<TaskCalendarView 
									tasks={filteredTasks}
									onTaskClick={setSelectedTask}
								/>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Task Detail Modal */}
			{selectedTask && (
				<TaskDetailModal
					task={selectedTask}
					onClose={() => setSelectedTask(null)}
				/>
			)}
		</div>
	)
}

// Stats Card Component
function StatCard({ 
	icon, 
	label, 
	value, 
	color 
}: { 
	icon: React.ReactNode
	label: string
	value: number
	color: 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'yellow'
}) {
	const colorClasses = {
		blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-400',
		green: 'from-green-500/10 to-green-500/5 border-green-500/20 text-green-600 dark:text-green-400',
		purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-600 dark:text-purple-400',
		red: 'from-red-500/10 to-red-500/5 border-red-500/20 text-red-600 dark:text-red-400',
		orange: 'from-orange-500/10 to-orange-500/5 border-orange-500/20 text-orange-600 dark:text-orange-400',
		yellow: 'from-yellow-500/10 to-yellow-500/5 border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
	}

	return (
		<div className={`
			relative overflow-hidden
			bg-gradient-to-br ${colorClasses[color]}
			backdrop-blur-sm rounded-xl border p-4
			transition-all duration-300 hover:scale-105 hover:shadow-lg
			group cursor-default
		`}>
			<div className="flex items-center justify-between mb-2">
				<div className="opacity-80 group-hover:opacity-100 transition-opacity">
					{icon}
				</div>
				<span className="text-2xl font-bold">{value}</span>
			</div>
			<p className="text-xs font-medium opacity-80">{label}</p>
			
			{/* Animated background effect */}
			<div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
		</div>
	)
}

export default TasksView
