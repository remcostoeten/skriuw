'use client'

import type { Task } from '@/api/db/schema'
import { useUpdateTask } from '@/modules/tasks/api/mutations/update'
import { useDestroyTask } from '@/modules/tasks/api/mutations/destroy'
import { useCreateTask } from '@/modules/tasks/api/mutations/create'
import { useAddTaskComment } from '@/modules/tasks/api/mutations/add-comment'
import { useGetProjects } from '@/modules/projects/api/queries/get-projects'
import { useGetAllTasks } from '@/modules/tasks/api/queries/get-all-tasks'
import { useState, useEffect } from 'react'
import {
	X,
	Calendar,
	Clock,
	Tag as TagIcon,
	AlertCircle,
	MessageSquare,
	CheckCircle2,
	Trash2,
	Link as LinkIcon,
	RefreshCw,
	Bell,
	Flag,
	FolderOpen,
	Activity,
	Plus,
	ChevronDown,
	ChevronRight
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

type TaskDetailModalProps = {
	task: Task
	onClose: () => void
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
	const { updateTask } = useUpdateTask()
	const { destroyTask } = useDestroyTask()
	const { createTask } = useCreateTask()
	const { addComment } = useAddTaskComment()
	const { projects } = useGetProjects()
	const { tasks: allTasks } = useGetAllTasks()
	
	const [newComment, setNewComment] = useState('')
	const [newTag, setNewTag] = useState('')
	const [showSubtasks, setShowSubtasks] = useState(true)
	const [showComments, setShowComments] = useState(true)
	const [showActivity, setShowActivity] = useState(false)
	const [showDependencies, setShowDependencies] = useState(false)

	const tags = task.tags ? (Array.isArray(task.tags) ? task.tags : task.tags.split(',').map(t => t.trim())) : []
	
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit,
			Placeholder.configure({ placeholder: 'Task description...' })
		],
		content: task.content,
		editorProps: {
			attributes: {
				class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[60px] text-foreground'
			}
		},
		onUpdate: ({ editor }) => {
			const html = editor.getHTML()
			if (html !== task.content) {
				updateTask(String(task.id), { content: html })
			}
		}
	})

	const handleDelete = async () => {
		if (confirm('Are you sure you want to delete this task?')) {
			await destroyTask(String(task.id))
			onClose()
		}
	}

	const handleAddComment = async () => {
		if (!newComment.trim()) return
		await addComment({ taskId: String(task.id), body: newComment })
		setNewComment('')
	}

	const handleAddTag = () => {
		if (!newTag.trim()) return
		const updatedTags = [...tags, newTag.trim()].join(',')
		updateTask(String(task.id), { tags: [updatedTags] as any })
		setNewTag('')
	}

	const handleRemoveTag = (tagToRemove: string) => {
		const updatedTags = tags.filter(t => t !== tagToRemove).join(',')
		updateTask(String(task.id), { tags: [updatedTags] as any })
	}

	const handleAddSubtask = async () => {
		const position = (task.subtasks?.length || 0) + 1
		await createTask({
			content: 'New subtask',
			position,
			parentId: String(task.id)
		})
	}

	const handleToggleComplete = () => {
		updateTask(String(task.id), { completed: !task.completed })
	}

	const handleSetDueDate = (dateStr: string) => {
		const ms = dateStr ? new Date(dateStr + 'T00:00:00').getTime() : undefined
		updateTask(String(task.id), { dueAt: ms as any })
	}

	const handleSetReminder = (dateStr: string) => {
		const ms = dateStr ? new Date(dateStr).getTime() : undefined
		// We need to add reminderAt to the mutation type
		updateTask(String(task.id), { dueAt: ms as any } as any) // TODO: Fix this when reminderAt is added to mutation
	}

	const isOverdue = task.dueAt && task.dueAt < Date.now() && !task.completed

	// Handle escape key to close modal
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleEscape)
		return () => window.removeEventListener('keydown', handleEscape)
	}, [onClose])

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
			<div 
				className="w-full max-w-4xl max-h-[90vh] bg-background rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
				onClick={e => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
					<div className="flex items-center gap-3 flex-1">
						<button
							onClick={handleToggleComplete}
							className={`
								p-2 rounded-lg transition-all
								${task.completed 
									? 'bg-green-500/20 text-green-600' 
									: 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
								}
							`}
						>
							<CheckCircle2 className="w-5 h-5" />
						</button>
						
						<div className="flex-1">
							<div className="flex items-center gap-2 mb-1">
								<span className={`
									text-xs font-semibold px-2 py-0.5 rounded-full
									${getPriorityBadge(task.priority).className}
								`}>
									{getPriorityBadge(task.priority).label}
								</span>
								
								<span className={`
									text-xs font-semibold px-2 py-0.5 rounded-full
									${getStatusBadge(task.status).className}
								`}>
									{getStatusBadge(task.status).label}
								</span>
							</div>
							
							<p className="text-xs text-muted-foreground">
								Created {new Date(task.createdAt).toLocaleString()}
							</p>
						</div>
					</div>

					<button
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto scrollbar-thin">
					<div className="p-6 space-y-6">
						{/* Task Content Editor */}
						<div className="bg-background/50 rounded-xl border border-border/50 p-4">
							<EditorContent editor={editor} />
						</div>

						{/* Metadata Grid */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{/* Status */}
							<MetadataItem icon={<Activity className="w-4 h-4" />} label="Status">
								<Select
									value={task.status}
									onValueChange={value => updateTask(String(task.id), { status: value as any })}
								>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="todo">📝 To Do</SelectItem>
										<SelectItem value="in_progress">⚡ In Progress</SelectItem>
										<SelectItem value="blocked">🚧 Blocked</SelectItem>
										<SelectItem value="done">✅ Done</SelectItem>
									</SelectContent>
								</Select>
							</MetadataItem>

							{/* Priority */}
							<MetadataItem icon={<Flag className="w-4 h-4" />} label="Priority">
								<Select
									value={task.priority}
									onValueChange={value => updateTask(String(task.id), { priority: value as any })}
								>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="low">🟢 Low</SelectItem>
										<SelectItem value="med">🟡 Medium</SelectItem>
										<SelectItem value="high">🟠 High</SelectItem>
										<SelectItem value="urgent">🔴 Urgent</SelectItem>
									</SelectContent>
								</Select>
							</MetadataItem>

							{/* Due Date */}
							<MetadataItem icon={<Calendar className="w-4 h-4" />} label="Due Date">
								<div className="flex items-center gap-2">
									<Input
										type="date"
										value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ''}
										onChange={e => handleSetDueDate(e.target.value)}
										className={`h-9 ${isOverdue ? 'border-red-500 text-red-600' : ''}`}
									/>
									{isOverdue && <AlertCircle className="w-4 h-4 text-red-500" />}
								</div>
							</MetadataItem>

							{/* Reminder */}
							<MetadataItem icon={<Bell className="w-4 h-4" />} label="Reminder">
								<Input
									type="datetime-local"
									value={task.reminderAt ? new Date(task.reminderAt).toISOString().slice(0, 16) : ''}
									onChange={e => {
										const ms = e.target.value ? new Date(e.target.value).getTime() : undefined
										updateTask(String(task.id), { reminderAt: ms })
									}}
									className="h-9"
								/>
							</MetadataItem>

							{/* Project */}
							<MetadataItem icon={<FolderOpen className="w-4 h-4" />} label="Project">
								<Select
									value={String(task.project?.id || 'none')}
									onValueChange={value => 
										updateTask(String(task.id), { projectId: value === 'none' ? null : value })
									}
								>
									<SelectTrigger className="h-9">
										<SelectValue placeholder="No project" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">No Project</SelectItem>
										{projects
											.filter(p => p.status === 'active')
											.map(p => (
												<SelectItem key={p.id} value={String(p.id)}>
													{p.title}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</MetadataItem>

							{/* Recurrence */}
							<MetadataItem icon={<RefreshCw className="w-4 h-4" />} label="Recurrence">
								<Select
									value={task.recurrence || 'none'}
									onValueChange={value => {
										updateTask(String(task.id), { 
											recurrence: value === 'none' ? undefined : value 
										})
									}}
								>
									<SelectTrigger className="h-9">
										<SelectValue placeholder="No recurrence" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">No Recurrence</SelectItem>
										<SelectItem value="FREQ=DAILY">Daily</SelectItem>
										<SelectItem value="FREQ=WEEKLY">Weekly</SelectItem>
										<SelectItem value="FREQ=MONTHLY">Monthly</SelectItem>
										<SelectItem value="FREQ=YEARLY">Yearly</SelectItem>
									</SelectContent>
								</Select>
							</MetadataItem>
						</div>

						{/* Tags */}
						<div className="space-y-3">
							<SectionHeader icon={<TagIcon className="w-4 h-4" />} title="Tags" />
							<div className="flex flex-wrap gap-2 mb-2">
								{tags.map((tag, idx) => (
									<span
										key={idx}
										className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
									>
										{tag}
										<button
											onClick={() => handleRemoveTag(tag)}
											className="hover:text-destructive transition-colors"
										>
											<X className="w-3 h-3" />
										</button>
									</span>
								))}
							</div>
							<div className="flex gap-2">
								<Input
									placeholder="Add a tag..."
									value={newTag}
									onChange={e => setNewTag(e.target.value)}
									onKeyDown={e => e.key === 'Enter' && handleAddTag()}
									className="h-9"
								/>
								<Button onClick={handleAddTag} size="sm">
									<Plus className="w-4 h-4" />
								</Button>
							</div>
						</div>

						{/* Dependencies */}
						<div className="space-y-3">
							<button
								onClick={() => setShowDependencies(!showDependencies)}
								className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
							>
								{showDependencies ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
								<LinkIcon className="w-4 h-4" />
								<span>Dependencies ({(task.dependsOn?.length || 0) + (task.dependents?.length || 0)})</span>
							</button>
							
							{showDependencies && (
								<div className="ml-6 space-y-4">
									<div>
										<h4 className="text-xs font-medium text-muted-foreground mb-2">Depends On</h4>
										{task.dependsOn && task.dependsOn.length > 0 ? (
											<div className="space-y-1">
												{task.dependsOn.map(dep => (
													<div key={dep.id} className="text-sm px-3 py-2 rounded bg-muted/50 border border-border/30">
														{stripHtml(dep.content)}
													</div>
												))}
											</div>
										) : (
											<p className="text-xs text-muted-foreground">No dependencies</p>
										)}
									</div>
									
									<div>
										<h4 className="text-xs font-medium text-muted-foreground mb-2">Blocks These Tasks</h4>
										{task.dependents && task.dependents.length > 0 ? (
											<div className="space-y-1">
												{task.dependents.map(dep => (
													<div key={dep.id} className="text-sm px-3 py-2 rounded bg-muted/50 border border-border/30">
														{stripHtml(dep.content)}
													</div>
												))}
											</div>
										) : (
											<p className="text-xs text-muted-foreground">Not blocking any tasks</p>
										)}
									</div>
								</div>
							)}
						</div>

						{/* Subtasks */}
						<div className="space-y-3">
							<button
								onClick={() => setShowSubtasks(!showSubtasks)}
								className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
							>
								{showSubtasks ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
								<CheckCircle2 className="w-4 h-4" />
								<span>Subtasks ({task.subtasks?.length || 0})</span>
							</button>
							
							{showSubtasks && (
								<div className="ml-6 space-y-2">
									{task.subtasks && task.subtasks.length > 0 ? (
										task.subtasks.map(subtask => (
											<div key={subtask.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border/30">
												<input
													type="checkbox"
													checked={subtask.completed}
													onChange={() => updateTask(String(subtask.id), { completed: !subtask.completed })}
													className="rounded w-4 h-4 cursor-pointer"
												/>
												<span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
													{stripHtml(subtask.content)}
												</span>
											</div>
										))
									) : (
										<p className="text-xs text-muted-foreground">No subtasks</p>
									)}
									
									<Button onClick={handleAddSubtask} variant="outline" size="sm" className="w-full">
										<Plus className="w-4 h-4 mr-2" />
										Add Subtask
									</Button>
								</div>
							)}
						</div>

						{/* Comments */}
						<div className="space-y-3">
							<button
								onClick={() => setShowComments(!showComments)}
								className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
							>
								{showComments ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
								<MessageSquare className="w-4 h-4" />
								<span>Comments ({task.comments?.length || 0})</span>
							</button>
							
							{showComments && (
								<div className="ml-6 space-y-3">
									{task.comments && task.comments.length > 0 && (
										<div className="space-y-2">
											{task.comments.map(comment => (
												<div key={comment.id} className="p-3 rounded-lg bg-muted/30 border border-border/30">
													<p className="text-sm text-foreground">{comment.body}</p>
													<p className="text-xs text-muted-foreground mt-1">
														{new Date(comment.createdAt).toLocaleString()}
													</p>
												</div>
											))}
										</div>
									)}
									
									<div className="flex gap-2">
										<Input
											placeholder="Add a comment..."
											value={newComment}
											onChange={e => setNewComment(e.target.value)}
											onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
											className="h-9"
										/>
										<Button onClick={handleAddComment} size="sm">
											<MessageSquare className="w-4 h-4" />
										</Button>
									</div>
								</div>
							)}
						</div>

						{/* Activity */}
						<div className="space-y-3">
							<button
								onClick={() => setShowActivity(!showActivity)}
								className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
							>
								{showActivity ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
								<Activity className="w-4 h-4" />
								<span>Activity ({task.activity?.length || 0})</span>
							</button>
							
							{showActivity && task.activity && task.activity.length > 0 && (
								<div className="ml-6 space-y-1">
									{task.activity.map(activity => (
										<div key={activity.id} className="text-xs text-muted-foreground py-1">
											<span className="font-medium">{new Date(activity.createdAt).toLocaleString()}</span>
											{' — '}
											<span className="font-semibold">{activity.type}</span>
											{': '}
											<span>{activity.message}</span>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
					<Button
						onClick={handleDelete}
						variant="destructive"
						size="sm"
						className="gap-2"
					>
						<Trash2 className="w-4 h-4" />
						Delete Task
					</Button>
					
					<Button onClick={onClose} variant="outline" size="sm">
						Close
					</Button>
				</div>
			</div>
		</div>
	)
}

function MetadataItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
	return (
		<div className="space-y-2">
			<label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
				{icon}
				<span>{label}</span>
			</label>
			{children}
		</div>
	)
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
	return (
		<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
			{icon}
			<span>{title}</span>
		</div>
	)
}

function getPriorityBadge(priority: string) {
	const badges = {
		urgent: { label: 'Urgent', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
		high: { label: 'High', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
		med: { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
		low: { label: 'Low', className: 'bg-green-500/10 text-green-600 dark:text-green-400' }
	}
	return badges[priority as keyof typeof badges] || badges.med
}

function getStatusBadge(status: string) {
	const badges = {
		todo: { label: 'To Do', className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400' },
		in_progress: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
		blocked: { label: 'Blocked', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
		done: { label: 'Done', className: 'bg-green-500/10 text-green-600 dark:text-green-400' }
	}
	return badges[status as keyof typeof badges] || badges.todo
}

function stripHtml(html: string): string {
	if (typeof window === 'undefined') return html
	const tmp = document.createElement('div')
	tmp.innerHTML = html
	return tmp.textContent || tmp.innerText || ''
}

