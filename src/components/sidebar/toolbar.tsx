/**
 * Sidebar Toolbar Component
 * Provides toolbar controls for the sidebar with keyboard shortcut integration
 */

'use client'

import { useCallback, useMemo } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Search,
  Plus,
  Settings,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useUnifiedShortcuts } from '@/hooks/use-unified-shortcuts'
import { shortcutRegistry } from '@/lib/shortcut-registry'
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
    console.log('[SidebarToolbar] New note button clicked')
  }, [onNoteCreate])

  const handleToggleSearch = useCallback(() => {
    onToggleSearch?.()
    console.log('[SidebarToolbar] Toggle search button clicked')
  }, [onToggleSearch])

  const handleNewFolder = useCallback(() => {
    onNewFolder?.()
    console.log('[SidebarToolbar] New folder button clicked')
  }, [onNewFolder])

  const handleSettings = useCallback(() => {
    onSettings?.()
    console.log('[SidebarToolbar] Settings button clicked')
  }, [onSettings])

  const handleExpand = useCallback(() => {
    onExpandToggle?.()
    console.log('[SidebarToolbar] Expand toggle button clicked')
  }, [onExpandToggle])

  const handleZoomIn = useCallback(() => {
    onZoomIn?.()
    console.log('[SidebarToolbar] Zoom in button clicked')
  }, [onZoomIn])

  const handleZoomOut = useCallback(() => {
    onZoomOut?.()
    console.log('[SidebarToolbar] Zoom out button clicked')
  }, [onZoomOut])

  // Register toolbar shortcuts
  useUnifiedShortcuts([
    {
      id: 'toolbar-new-note',
      handler: handleNewNote
    },
    {
      id: 'toolbar-toggle-search',
      handler: handleToggleSearch
    },
    {
      id: 'toolbar-new-folder',
      handler: handleNewFolder
    },
    {
      id: 'toolbar-settings',
      handler: handleSettings
    },
    {
      id: 'toolbar-expand',
      handler: handleExpand
    },
    {
      id: 'zoom-in',
      handler: handleZoomIn
    },
    {
      id: 'zoom-out',
      handler: handleZoomOut
    }
  ], {
    context: 'sidebar',
    enabled: true
  })

  // Get shortcuts for tooltips
  const shortcuts = useMemo(() => {
    const allShortcuts = shortcutRegistry.getAllShortcuts()
    return new Map(allShortcuts.map(s => [s.action, s.key]))
  }, [])

  const getShortcutKey = (action: string) => {
    return shortcuts.get(action) || ''
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

        {/* New Note button */}
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
              title={`Zoom out (${getShortcutKey('zoom-out')})`}
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
              title={`Zoom in (${getShortcutKey('zoom-in')})`}
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