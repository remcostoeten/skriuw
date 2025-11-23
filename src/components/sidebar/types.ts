/**
 * Sidebar content types
 * Each type represents a different sidebar content implementation
 */
export type SidebarContentType =
    | 'files' // Default: files and folders tree
    | 'table-of-contents' // Table of contents for documentation/content pages
    | 'tasks' // Tasks list (future)
    | 'agenda' // Agenda/calendar view (future)
    | 'custom' // Custom content passed as children

export interface SidebarContentProps {
    activeNoteId?: string
    [key: string]: any
}
