'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Calendar, CheckSquare, Clock, Trash2, X, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@skriuw/shared'
import { Checkbox } from '@skriuw/ui/primitives/checkbox'

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

export default function TaskDetailPage() {
    const router = useRouter()
    const params = useParams()
    const taskId = params.taskId as string

    const [task, setTask] = useState<TaskDetail | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Local state for editing
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState<string>('')

    const fetchTask = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/tasks/item/${taskId}`)
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Task not found')
                }
                throw new Error('Failed to fetch task')
            }
            const data = await response.json()
            setTask(data)
            setDescription(data.description || '')
            if (data.dueDate) {
                setDueDate(new Date(data.dueDate).toISOString().split('T')[0])
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load task')
        } finally {
            setIsLoading(false)
        }
    }, [taskId])

    useEffect(() => {
        if (taskId) {
            fetchTask()
        }
    }, [taskId, fetchTask])

    const updateTask = async (updates: Partial<TaskDetail>) => {
        if (!task) return

        setIsSaving(true)
        try {
            const response = await fetch(`/api/tasks/item/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            })

            if (!response.ok) {
                throw new Error('Failed to update task')
            }

            const updatedTask = await response.json()
            setTask(updatedTask)
            toast.success('Task updated')
        } catch (err) {
            toast.error('Failed to update task')
            console.error(err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleBack = () => {
        router.back()
    }

    const handleGoToNote = () => {
        if (task) {
            router.push(`/note/${task.noteId}?blockId=${task.blockId}`)
        }
    }

    const handleToggleCheck = async () => {
        if (!task) return
        const newChecked = task.checked ? 0 : 1
        setTask({ ...task, checked: newChecked })
        await updateTask({ checked: newChecked })
    }

    const handleDescriptionBlur = async () => {
        if (!task || description === (task.description || '')) return
        await updateTask({ description: description || null })
    }

    const handleDueDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setDueDate(value)

        if (value) {
            const timestamp = new Date(value).getTime()
            await updateTask({ dueDate: timestamp })
        } else {
            await updateTask({ dueDate: null })
        }
    }

    const handleClearDueDate = async () => {
        setDueDate('')
        await updateTask({ dueDate: null })
    }

    const handleDelete = async () => {
        if (!task) return

        if (!confirm('Are you sure you want to delete this task?')) return

        try {
            const response = await fetch(`/api/tasks/item/${taskId}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('Failed to delete task')
            }

            toast.success('Task deleted')
            router.push('/tasks')
        } catch (err) {
            toast.error('Failed to delete task')
            console.error(err)
        }
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-muted-foreground">Loading task...</div>
            </div>
        )
    }

    if (error || !task) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-red-400">{error || 'Task not found'}</div>
                <button
                    onClick={handleBack}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                    Go back
                </button>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={handleBack}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    title="Go back"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                {task.noteName && (
                    <button
                        onClick={handleGoToNote}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        title="Go to source note"
                    >
                        <span className="truncate max-w-[200px]">{task.noteName}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                )}
                {isSaving && (
                    <span className="text-xs text-muted-foreground ml-auto">Saving...</span>
                )}
            </div>

            {/* Task Title */}
            <div className="flex items-start gap-4 mb-8">
                <div className="shrink-0 mt-1">
                    <Checkbox
                        checked={!!task.checked}
                        size="lg"
                        variant="default"
                        onChange={handleToggleCheck}
                    />
                </div>
                <h1
                    className={cn(
                        'text-2xl font-semibold flex-1',
                        task.checked && 'line-through text-muted-foreground'
                    )}
                >
                    {task.content || 'Untitled task'}
                </h1>
            </div>

            {/* Task Details */}
            <div className="space-y-6">
                {/* Due Date Section */}
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1">
                        <div className="text-sm font-medium">Due Date</div>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={handleDueDateChange}
                            className={cn(
                                'text-xs bg-transparent border-none p-0 mt-0.5',
                                'focus:outline-none focus:ring-0',
                                dueDate ? 'text-foreground' : 'text-muted-foreground'
                            )}
                        />
                    </div>
                    {dueDate && (
                        <button
                            onClick={handleClearDueDate}
                            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                            title="Clear due date"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Description Section */}
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-muted-foreground" />
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={handleDescriptionBlur}
                        placeholder="Add a description, notes, or details about this task..."
                        className={cn(
                            'w-full min-h-[150px] p-4 rounded-lg resize-none',
                            'bg-muted/30 border border-border/50',
                            'text-sm text-foreground placeholder:text-muted-foreground',
                            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
                        )}
                    />
                </div>

                {/* Subtasks Section (placeholder - would require additional schema) */}
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-muted-foreground" />
                        Subtasks
                    </label>
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
                        <p className="text-xs text-muted-foreground">
                            Subtasks are created as nested tasks within notes
                        </p>
                        <button
                            onClick={handleGoToNote}
                            className="mt-2 text-xs text-primary hover:underline"
                        >
                            Edit in note
                        </button>
                    </div>
                </div>

                {/* Metadata */}
                <div className="pt-6 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Created {new Date(task.createdAt).toLocaleDateString()}
                    </div>
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete task
                    </button>
                </div>
            </div>
        </div>
    )
}
