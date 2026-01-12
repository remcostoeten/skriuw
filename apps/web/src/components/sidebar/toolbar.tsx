/**
 * Sidebar Toolbar Component
 * Provides toolbar controls for the sidebar with keyboard shortcut integration
 */

'use client'

import { useGetShortcuts } from '@/modules/shortcuts'
import { Button } from '@/shared/components/ui/button'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MoreVertical,
  Plus,
  Search,
  Settings,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { cn } from 'utils'

export interface SidebarToolbarProps {
  isExpanded?: boolean
  onExpandToggle?: () => void
  onNoteCreate?: (noteId?: string) => void
  onToggleSearch?: () => void
  onNewFolder?: () => void
  onSettings?: () => void
  className?: string
  zoom?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
}

export function SidebarToolbar({
  isExpanded = false,
  onExpandToggle,
  onNoteCreate,
  onToggleSearch,
  onNewFolder,
  onSettings,
  className,
  zoom = 100,
  onZoomIn,
  onZoomOut
}: SidebarToolbarProps) {

  const handleNewNote = useCallback(() => {
    onNoteCreate?.()
  }, [onNoteCreate])

  const handleToggleSearch = useCallback(() => {
    onToggleSearch?.()
  }, [onToggleSearch])

  const handleNewFolder = useCallback(() => {
    onNewFolder?.()
  }, [onNewFolder])

  const handleSettings = useCallback(() => {
    onSettings?.()
  }, [onSettings])

  const handleExpand = useCallback(() => {
    onExpandToggle?.()
  }, [onExpandToggle])

  const handleZoomIn = useCallback(() => {
    onZoomIn?.()
  }, [onZoomIn])

  const handleZoomOut = useCallback(() => {
    onZoomOut?.()
  }, [onZoomOut])

  // Listen to global shortcut events instead of registering duplicate handlers
  useEffect(() => {
    const handleNoteCreate = () => handleNewNote()
    const handleSearchToggle = () => handleToggleSearch()
    const handleFolderCreate = () => handleNewFolder()
    const handlePreferencesOpen = () => handleSettings()
    const handleFoldersToggle = () => handleExpand()

    window.addEventListener('note:create', handleNoteCreate)
    window.addEventListener('search:toggle', handleSearchToggle)
    window.addEventListener('folder:create', handleFolderCreate)
    window.addEventListener('preferences:open', handlePreferencesOpen)
    window.addEventListener('folders:toggle', handleFoldersToggle)

    return () => {
      window.removeEventListener('note:create', handleNoteCreate)
      window.removeEventListener('search:toggle', handleSearchToggle)
      window.removeEventListener('folder:create', handleFolderCreate)
      window.removeEventListener('preferences:open', handlePreferencesOpen)
      window.removeEventListener('folders:toggle', handleFoldersToggle)
    }
  }, [handleNewNote, handleToggleSearch, handleNewFolder, handleSettings, handleExpand])

  // Get shortcuts for tooltips from database
  const { shortcuts: allShortcuts } = useGetShortcuts()
  const shortcuts = useMemo(() => {
    return new Map(allShortcuts.map(s => [s.action, s.combo]))
  }, [allShortcuts])

  const getShortcutKey = (action: string): string => {
    return shortcuts.get(action as any) || ''
  }

  return (
    <div className={cn(
      "flex items-center justify-between p-2 border-b bg-background/95 backdrop-blur-sm",
      className
    )} data-context="sidebar">
      {/* Left side controls */}
      <div className="flex items-center gap-1">
        {/* Expand/Collapse button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExpand}
          className="h-8 w-8 p-0"
          title={`${isExpanded ? 'Collapse' : 'Expand'} all folders (${getShortcutKey('toggle-folders')})`}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewNote}
          className="h-8 px-2 gap-1"
          title={`New note (${getShortcutKey('new-note')})`}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Note</span>
        </Button>

        {/* New Folder button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewFolder}
          className="h-8 px-2 gap-1"
          title={`New folder (${getShortcutKey('new-folder')})`}
        >
          <FolderPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Folder</span>
        </Button>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1">
        {/* Zoom controls */}
        {(onZoomIn || onZoomOut) && (
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              className="h-6 w-6 p-0"
              disabled={zoom <= 50}
              title="Zoom out"
            >
              <ZoomOut className="h-3 w-3" />
            </Button>

            <span className="text-xs px-1 py-0 h-5 min-w-12 text-center bg-secondary text-secondary-foreground rounded inline-flex items-center justify-center">
              {Math.round(zoom)}%
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              className="h-6 w-6 p-0"
              disabled={zoom >= 200}
              title="Zoom in"
            >
              <ZoomIn className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Search button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleSearch}
          className="h-8 w-8 p-0"
          title={`Toggle search (${getShortcutKey('toggle-search')})`}
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Settings button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSettings}
          className="h-8 w-8 p-0"
          title={`Settings (${getShortcutKey('settings')})`}
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* More options */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="More options"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default SidebarToolbar
