'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import { Trash2, X, MoreHorizontal, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

import { cn } from '@skriuw/core-logic'
import { Checkbox } from '@skriuw/ui/primitives/checkbox'
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
        if (!task || !confirm('Delete this task?')) return
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
        if (isActive) return 'w-full sm:w-[420px] lg:w-[480px]'
        // Collapsed panels are thinner
        return 'w-[60px] sm:w-[80px]'
    }

    return (
        <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{
                x: 0,
                opacity: 1,
            }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{
                type: 'spring',
                damping: 25,
                stiffness: 300,
                delay: index * 0.05
            }}
            className={cn(
                'relative flex flex-col shrink-0',
                'bg-background/95 backdrop-blur-md',
                'border-l border-border/50',
                'shadow-xl',
                'transition-all duration-300',
                getPanelWidth(),
                isCollapsed && 'cursor-pointer hover:bg-muted/30'
            )}
            onClick={isCollapsed ? onNavigateBack : undefined}
        >
            {/* Collapsed state - just show back indicator */}
            {isCollapsed ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
                    <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                    <span
                        className="text-xs text-muted-foreground writing-mode-vertical rotate-180"
                        style={{ writingMode: 'vertical-rl' }}
                    >
                        {task?.content?.slice(0, 20) || 'Loading...'}
                        {(task?.content?.length ?? 0) > 20 ? '...' : ''}
                    </span>
                </div>
            ) : (
                /* Full panel content */
                <>
                    {isLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : error || !task ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
                            <span className="text-red-400 text-sm">{error || 'Not found'}</span>
                            <button onClick={onClose} className="text-xs underline text-muted-foreground">
                                Close
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="shrink-0 border-b border-border/50">
                                {/* Top bar */}
                                <div className="flex items-center justify-between px-3 py-2">
                                    <button
                                        onClick={onClose}
                                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={handleDelete}
                                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                                            <MoreHorizontal className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Title with checkbox */}
                                <div className="flex items-start gap-3 px-4 py-3">
                                    <Checkbox
                                        checked={task.checked === 1}
                                        onChange={() => {
                                            const newChecked = task.checked === 1 ? 0 : 1
                                            setTask({ ...task, checked: newChecked })
                                            updateTask({ checked: newChecked })
                                        }}
                                        size="md"
                                    />
                                    <h2 className={cn(
                                        'text-lg font-semibold leading-tight flex-1',
                                        task.checked === 1 && 'line-through text-muted-foreground'
                                    )}>
                                        {task.content || 'Untitled'}
                                    </h2>
                                </div>

                                {/* Metadata row */}
                                <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
                                    {task.parentTaskId && (
                                        <button
                                            onClick={onNavigateBack}
                                            className="shrink-0 h-7 px-2 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                        >
                                            ← Parent
                                        </button>
                                    )}
                                    <DueDateButton
                                        dueDate={task.dueDate}
                                        onUpdate={(dueDate: number | null) => {
                                            setTask({ ...task, dueDate })
                                            updateTask({ dueDate })
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Editor */}
                            <div className="flex-1 min-h-0 overflow-hidden">
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

                            {/* Footer */}
                            <div className="shrink-0 px-4 py-2 border-t border-border/30 text-xs text-muted-foreground/60 text-center">
                                Created {new Date(task.createdAt).toLocaleDateString()}
                            </div>
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
                <>
                    {/* Backdrop overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeAllTasks}
                        className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50"
                    />

                    {/* Stacked panels container */}
                    <div className="fixed inset-y-0 right-0 z-50 flex">
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
                </>
            )}
        </AnimatePresence>
    )
}

// Keep the old export for backwards compatibility
export { TaskPanelStack as TaskDetailPanel }
