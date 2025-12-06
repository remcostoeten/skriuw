'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

import { cn } from '@skriuw/core-logic'
import { TaskDescriptionEditor } from './task-description-editor'

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

interface TaskDetailPanelProps {
    taskId: string | null
    onClose: () => void
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
    const [task, setTask] = useState<TaskDetail | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Local state for editing
    const [description, setDescription] = useState('')

    const fetchTask = useCallback(async () => {
        if (!taskId) return

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
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load task')
        } finally {
            setIsLoading(false)
        }
    }, [taskId])

    useEffect(() => {
        if (taskId) {
            fetchTask()
        } else {
            setTask(null)
            setDescription('')
        }
    }, [taskId, fetchTask])

    const updateTask = async (updates: Partial<TaskDetail>) => {
        if (!task || !taskId) return

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
            // Optional: minimal toast or feedback? 
            // toast.success('Saved') 
        } catch (err) {
            toast.error('Failed to update task')
            console.error(err)
        }
    }

    const handleDelete = async () => {
        if (!task || !taskId) return

        if (!confirm('Are you sure you want to delete this task?')) return

        try {
            const response = await fetch(`/api/tasks/item/${taskId}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('Failed to delete task')
            }

            toast.success('Task deleted')
            onClose()
        } catch (err) {
            toast.error('Failed to delete task')
            console.error(err)
        }
    }

    return (
        <AnimatePresence>
            {taskId && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-background border-l border-border shadow-xl flex flex-col"
                    >
                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-muted-foreground">Loading task...</div>
                            </div>
                        ) : error || !task ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                <div className="text-red-400">{error || 'Task not found'}</div>
                                <button
                                    onClick={onClose}
                                    className="text-sm text-muted-foreground hover:text-foreground underline"
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Header - Minimal (Actions) */}
                                <div className="flex items-center justify-end p-2 gap-1">
                                    <button
                                        onClick={handleDelete}
                                        className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
                                        title="Delete task"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                    {/* Editor Area - Seamless & Full Panel */}
                                    <div className="flex-1 min-h-0 relative">
                                        <TaskDescriptionEditor
                                            title={task.content}
                                            initialContent={description}
                                            onTitleUpdate={(newTitle) => {
                                                if (newTitle !== task.content) {
                                                    setTask({ ...task, content: newTitle })
                                                    updateTask({ content: newTitle })
                                                }
                                            }}
                                            onUpdate={(content) => {
                                                setDescription(content)
                                                updateTask({ description: content })
                                            }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
