'use client'

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type TaskBreadcrumb = {
	id: string
	blockId: string
	content: string
}

type TaskContextValue = {
	parentTaskId: string | null
	noteId: string | null
	depth: number
	breadcrumbs: TaskBreadcrumb[]
	navigateToTask: (taskId: string) => void
}

const TaskContext = createContext<TaskContextValue | null>(null)

type TaskContextProviderProps = {
	children: ReactNode
	parentTaskId: string | null
	noteId: string | null
	depth?: number
	breadcrumbs?: TaskBreadcrumb[]
	onNavigate?: (taskId: string) => void
}

export function TaskContextProvider({
	children,
	parentTaskId,
	noteId,
	depth = 0,
	breadcrumbs = [],
	onNavigate
}: TaskContextProviderProps) {
	const value = useMemo<TaskContextValue>(
		() => ({
			parentTaskId,
			noteId,
			depth,
			breadcrumbs,
			navigateToTask: onNavigate ?? (() => {})
		}),
		[parentTaskId, noteId, depth, breadcrumbs, onNavigate]
	)

	return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>
}

export function useTaskContext(): TaskContextValue | null {
	return useContext(TaskContext)
}

export function useParentTaskId(): string | null {
	const ctx = useContext(TaskContext)
	return ctx?.parentTaskId ?? null
}
