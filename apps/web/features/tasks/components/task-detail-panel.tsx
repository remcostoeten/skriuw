'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import { Trash2, X, MoreHorizontal, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

import { cn } from '@skriuw/shared'
import { TaskDescriptionEditor } from './task-description-editor'
import { DueDateButton } from './due-date-button'
import { TaskContextProvider } from '../hooks/use-task-context'
import { useUIStore } from '@/stores/ui-store'

interface TaskDetail {
    id: string
    noteId: string
    noteName?: string | null
    blockId: string
    content: string
    description: string | null
    checked: number
    dueDate: number | null
    parentTaskId: string | null
    position: number
    createdAt: number
    updatedAt: number
}

interface SingleTaskPanelProps {
    taskId: string
    index: number
    totalPanels: number
    onClose: () => void
    onNavigateBack: () => void
}

// Individual panel for a single task in the stack
const SingleTaskPanel = memo(function SingleTaskPanel({
    taskId,
    index,
    totalPanels,
    onClose,
    onNavigateBack,
}: SingleTaskPanelProps) {
    const [task, setTask] = useState<TaskDetail | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [description, setDescription] = useState('')

    const isActive = index === totalPanels - 1
    const isCollapsed = !isActive && totalPanels > 1

    const fetchTask = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/tasks/item/${taskId}`)
            if (!response.ok) {
                throw new Error(response.status === 404 ? 'Task not found' : 'Failed to fetch')
            }
            const data = await response.json()
            setTask(data)
            setDescription(data.description || '')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
            setIsLoading(false)
        }
    }, [taskId])

    useEffect(() => {
        fetchTask()
    }, [fetchTask])

    const updateTask = async (updates: Partial<TaskDetail>) => {
        if (!task) return
        try {
            const response = await fetch(`/api/tasks/item/${task.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            })
            if (response.ok) {
                const updated = await response.json()
                setTask((prev) => (prev ? { ...prev, ...updated } : updated))
            }
        } catch {
            toast.error('Failed to update')
        }
    }

    const handleDelete = async () => {
        if (!task) return
        try {
            await fetch(`/api/tasks/item/${task.id}`, { method: 'DELETE' })
            toast.success('Deleted')
            onNavigateBack()
        } catch {
            toast.error('Failed to delete')
        }
    }

    // Calculate panel width based on position
    const getPanelWidth = () => {
        if (isActive) return 'w-full sm:w-[480px] lg:w-[560px]'
        // Collapsed panels are thinner
        return 'w-[60px] sm:w-[80px]'
    }

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
                duration: 0.25,
                ease: [0.4, 0, 0.2, 1]
            }}
            className={cn(
                'relative flex flex-col shrink-0',
                'bg-background',
                'border-l border-border/30',
                'shadow-2xl',
                getPanelWidth(),
                isCollapsed && 'cursor-pointer hover:bg-muted/20'
            )}
            onClick={isCollapsed ? onNavigateBack : undefined}
        >
            {/* Collapsed state - just show back indicator */}
            {isCollapsed ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
                    <ChevronLeft className="w-4 h-4 text-muted-foreground/60" />
                    <span
                        className="text-xs text-muted-foreground/60 writing-mode-vertical rotate-180"
                        style={{ writingMode: 'vertical-rl' }}
                    >
                        {task?.content?.slice(0, 20) || '...'}
                        {(task?.content?.length ?? 0) > 20 ? '...' : ''}
                    </span>
                </div>
            ) : (
                /* Full panel content */
                <>
                    {/* Header - always show, with inline loading state */}
                    <div className="shrink-0">
                        {/* Top bar */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                title="Close panel"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            {isLoading && (
                                <span className="text-xs text-muted-foreground/50">Loading...</span>
                            )}

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleDelete}
                                    disabled={isLoading || !task}
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                                    title="Delete task"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
                                    title="More options"
                                >
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {error ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                            <span className="text-sm text-destructive">{error}</span>
                            <button
                                onClick={onClose}
                                className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                                Close panel
                            </button>
                        </div>
                    ) : !task && !isLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                            <span className="text-sm text-muted-foreground">Task not found</span>
                            <button
                                onClick={onClose}
                                className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                                Close panel
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Title with checkbox */}
                            <div className="flex items-start gap-3 px-4 py-4">
                                <button
                                    onClick={() => {
                                        if (!task) return
                                        const newChecked = task.checked === 1 ? 0 : 1
                                        setTask({ ...task, checked: newChecked })
                                        updateTask({ checked: newChecked })
                                    }}
                                    disabled={!task}
                                    className={cn(
                                        'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                                        task?.checked === 1
                                            ? 'bg-primary border-primary text-primary-foreground'
                                            : 'border-muted-foreground/30 hover:border-muted-foreground/50'
                                    )}
                                >
                                    {task?.checked === 1 && (
                                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>
                                <h2 className={cn(
                                    'text-lg font-medium leading-snug flex-1',
                                    task?.checked === 1 && 'line-through text-muted-foreground'
                                )}>
                                    {task?.content || 'Untitled'}
                                </h2>
                            </div>

                            {/* Metadata buttons row */}
                            {task && (
                                <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                                    <DueDateButton
                                        dueDate={task.dueDate}
                                        onUpdate={(dueDate: number | null) => {
                                            setTask({ ...task, dueDate })
                                            updateTask({ dueDate })
                                        }}
                                    />
                                    {task.parentTaskId && (
                                        <button
                                            onClick={onNavigateBack}
                                            className="shrink-0 h-7 px-2.5 text-xs rounded-md border border-border/40 text-muted-foreground hover:bg-muted/40 transition-colors flex items-center gap-1"
                                        >
                                            ← Parent
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Divider */}
                            <div className="border-t border-border/20" />

                            {/* Editor */}
                            {task && (
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    <TaskContextProvider
                                        parentTaskId={task.id}
                                        noteId={task.noteId}
                                        depth={index + 1}
                                        breadcrumbs={[]}
                                    >
                                        <TaskDescriptionEditor
                                            title={task.content}
                                            initialContent={description}
                                            onTitleUpdate={(newTitle: string) => {
                                                if (newTitle !== task.content) {
                                                    setTask({ ...task, content: newTitle })
                                                    updateTask({ content: newTitle })
                                                }
                                            }}
                                            onUpdate={(content: string) => {
                                                setDescription(content)
                                                updateTask({ description: content })
                                            }}
                                        />
                                    </TaskContextProvider>
                                </div>
                            )}

                            {/* Footer */}
                            {task && (
                                <div className="shrink-0 px-4 py-2.5 border-t border-border/20 text-xs text-muted-foreground/50">
                                    Created {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </motion.div>
    )
})

/**
 * Stacked Task Panels - Superlist-style horizontal panel stack
 * Each subtask opens a new panel that slides in from the right
 */
export function TaskPanelStack() {
    const taskStack = useUIStore((s) => s.taskStack)
    const popTask = useUIStore((s) => s.popTask)
    const closeAllTasks = useUIStore((s) => s.closeAllTasks)

    const isOpen = taskStack?.length > 0

    const handlePopTask = useCallback(() => {
        popTask()
    }, [popTask])

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-y-0 right-0 z-40 flex h-full">
                    <AnimatePresence mode="popLayout">
                        {taskStack.map((taskId, index) => (
                            <SingleTaskPanel
                                key={taskId}
                                taskId={taskId}
                                index={index}
                                totalPanels={taskStack?.length}
                                onClose={closeAllTasks}
                                onNavigateBack={handlePopTask}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </AnimatePresence>
    )
}

// Keep the old export for backwards compatibility
export { TaskPanelStack as TaskDetailPanel }
