// Re-export query hooks for data fetching
export * from './hooks/use-tasks-query'

// Component exports
export { TaskPanelStack, TaskPanelStack as TaskDetailPanel } from './components/task-detail-panel'
export { DueDateButton } from './components/due-date-button'
export { TaskBreadcrumbs } from './components/task-breadcrumbs'
export { TaskDescriptionEditor } from './components/task-description-editor'
export * from './hooks/use-task-context'

// Type exports
export type { Task } from './types'
