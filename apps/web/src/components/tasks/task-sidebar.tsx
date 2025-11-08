import { TaskActionBar } from '@/components/tasks/task-action-bar'
import { useDestroyProject } from '@/modules/projects/api/mutations/destroy'
import { useGetProjects } from '@/modules/projects/api/queries/get-projects'
import { useGetAllTasks } from '@/modules/tasks/api/queries/get-all-tasks'
import { applyList, savedLists } from '@/modules/tasks/utils/saved-filters'
import { Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import type { Project, Task } from 'schema'
import { cn } from 'utils'

type props = {
	onFilterSelect?: (filterId: string | null) => void
	onProjectSelect?: (projectId: string | null) => void
	selectedFilterId?: string | null
	selectedProjectId?: string | null
}

export function TaskSidebar({
	onFilterSelect,
	onProjectSelect,
	selectedFilterId,
	selectedProjectId
}: props) {
	const { projects } = useGetProjects()
	const { tasks: allTasks } = useGetAllTasks()
	const { destroyProject } = useDestroyProject()

	const handleFilterClick = useCallback(
		(filterId: string) => {
			if (filterId === 'all') {
				onFilterSelect?.(null)
			} else if (selectedFilterId === filterId) {
				onFilterSelect?.(null)
			} else {
				onFilterSelect?.(filterId)
			}
			if (filterId !== 'all') {
				onProjectSelect?.(null)
			}
		},
		[selectedFilterId, onFilterSelect, onProjectSelect]
	)

	const handleProjectClick = useCallback(
		(projectId: string) => {
			if (selectedProjectId === projectId) {
				onProjectSelect?.(null)
			} else {
				onProjectSelect?.(projectId)
			}
			onFilterSelect?.(null)
		},
		[selectedProjectId, onProjectSelect, onFilterSelect]
	)

	const handleDeleteProject = useCallback(
		async (projectId: string, e: React.MouseEvent) => {
			e.stopPropagation()
			if (confirm('Are you sure you want to delete this project?')) {
				try {
					await destroyProject(projectId)
					if (selectedProjectId === projectId) {
						onProjectSelect?.(null)
					}
				} catch (error) {
					console.error('Failed to delete project:', error)
				}
			}
		},
		[destroyProject, selectedProjectId, onProjectSelect]
	)

	const handleCreateTask = useCallback(() => {}, [])

	const activeProjects = projects.filter(
		(p: Project) => p.status === 'active'
	)

	const allTasksCount = allTasks.length
	const projectTaskCounts = activeProjects.map((project: Project) => {
		const projectTasks = allTasks.filter(
			(t: Task) => t.project?.id === project.id
		)
		return { projectId: project.id, count: projectTasks.length }
	})
	const filterTaskCounts = savedLists.map(list => {
		const filtered = applyList(allTasks, list.id)
		return { filterId: list.id, count: filtered.length }
	})

	function getProjectTaskCount(projectId: string) {
		return (
			projectTaskCounts.find(p => p.projectId === projectId)?.count ?? 0
		)
	}

	function getFilterTaskCount(filterId: string) {
		return filterTaskCounts.find(f => f.filterId === filterId)?.count ?? 0
	}

	return (
		<div
			className={cn(
				'fixed left-0 sm:left-12 flex flex-col justify-start items-center bg-background overflow-y-auto',
				'transform transition-all duration-300 border-r'
			)}
			style={{
				width: '210px',
				height: 'calc(100vh - 4.5rem)'
			}}
		>
			<div
				className={cn(
					'h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10',
					'hover:bg-foreground/10 hover:delay-75 transition-all duration-200',
					'active:bg-foreground/20 active:cursor-col-resize!'
				)}
				role="presentation"
			/>

			<TaskActionBar
				onCreateTask={handleCreateTask}
				selectedProjectId={selectedProjectId}
			/>

			<div className="flex flex-col items-start gap-1 w-full px-2 pt-2 pb-2 border-b">
				<div className="w-full flex items-center justify-between px-2 py-1 mb-1">
					<h3 className="text-xs uppercase tracking-wide text-foreground font-semibold">
						Projects
					</h3>
				</div>

				{activeProjects.map((project: Project) => (
					<div
						key={project.id}
						onClick={() =>
							handleProjectClick(
								typeof project.id === 'string'
									? project.id
									: String(project.id)
							)
						}
						className={cn(
							'w-full flex items-center justify-between group px-2 py-1.5 rounded text-sm transition-colors cursor-pointer',
							'hover:bg-accent/50',
							selectedProjectId ===
								(typeof project.id === 'string'
									? project.id
									: String(project.id))
								? 'bg-accent text-foreground font-medium'
								: 'text-muted-foreground'
						)}
					>
						<span className="flex-1 truncate">
							{project.title} (
							{getProjectTaskCount(
								typeof project.id === 'string'
									? project.id
									: String(project.id)
							)}
							)
						</span>
						<button
							type="button"
							onClick={e => {
								e.stopPropagation()
								handleDeleteProject(
									typeof project.id === 'string'
										? project.id
										: String(project.id),
									e
								)
							}}
							className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity ml-1"
							title="Delete project"
						>
							<Trash2 className="w-3 h-3" />
						</button>
					</div>
				))}
			</div>

			<div className="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4">
				<div className="w-full px-2 py-1 mb-1">
					<h3 className="text-xs uppercase tracking-wide text-foreground font-semibold">
						Quick Filters
					</h3>
				</div>

				<button
					onClick={() => handleFilterClick('all')}
					className={cn(
						'w-full text-left px-2 py-1.5 rounded text-sm transition-colors',
						'hover:bg-accent/50',
						!selectedFilterId && !selectedProjectId
							? 'bg-accent text-foreground font-medium'
							: 'text-muted-foreground'
					)}
				>
					All Tasks ({allTasksCount})
				</button>

				{savedLists.map(list => (
					<button
						key={list.id}
						onClick={() => handleFilterClick(list.id)}
						className={cn(
							'w-full text-left px-2 py-1.5 rounded text-sm transition-colors',
							'hover:bg-accent/50',
							selectedFilterId === list.id
								? 'bg-accent text-foreground font-medium'
								: 'text-muted-foreground'
						)}
					>
						{list.name} ({getFilterTaskCount(list.id)})
					</button>
				))}
			</div>
		</div>
	)
}
