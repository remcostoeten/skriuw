import {
    Menu,
    PanelLeftClose,
    Search,
    Keyboard,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'

import { IconButton } from '@/shared/ui/icons'

type props = {
    noteName: string
    onToggleSidebar: () => void
    onToggleDesktopSidebar?: () => void
    onSearch?: (query: string) => void
    onToggleShortcuts?: () => void
    onNavigatePrevious?: () => void
    onNavigateNext?: () => void
    canNavigatePrevious?: boolean
    canNavigateNext?: boolean
}

export function TopToolbar({
    noteName,
    onToggleSidebar,
    onToggleDesktopSidebar,
    onSearch,
    onToggleShortcuts,
    onNavigatePrevious,
    onNavigateNext,
    canNavigatePrevious = false,
    canNavigateNext = false
}: props) {
    return (
        <div className="h-10 bg-background border-b border-border flex items-center justify-between px-1.5">
            <div className="flex items-center gap-1.5">
                <IconButton
                    icon={<Menu className="w-4 h-4 text-muted-foreground" />}
                    tooltip="Toggle sidebar"
                    variant="toolbar"
                    onClick={onToggleSidebar}
                    className="flex lg:hidden"
                />

                <IconButton
                    icon={
                        <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
                    }
                    tooltip="Toggle desktop sidebar"
                    variant="toolbar"
                    onClick={onToggleDesktopSidebar}
                    className="hidden lg:flex"
                />

                {onNavigatePrevious && onNavigateNext && (
                    <div className="flex items-center gap-0.5 ml-1">
                        <IconButton
                            icon={
                                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                            }
                            tooltip="Previous note"
                            variant="toolbar"
                            onClick={onNavigatePrevious}
                            disabled={!canNavigatePrevious}
                        />
                        <IconButton
                            icon={
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            }
                            tooltip="Next note"
                            variant="toolbar"
                            onClick={onNavigateNext}
                            disabled={!canNavigateNext}
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-center items-center flex-1 px-1.5 py-1 mx-1.5">
                <span className="text-[13px] text-foreground truncate max-w-[200px] sm:max-w-none">
                    {noteName}
                </span>
            </div>

            <div className="flex items-center gap-1.5">
                <IconButton
                    icon={<Search className="w-4 h-4 text-muted-foreground" />}
                    tooltip="Search notes"
                    variant="toolbar"
                    onClick={() => onSearch?.('')}
                />
                <IconButton
                    icon={
                        <Keyboard className="w-4 h-4 text-muted-foreground" />
                    }
                    tooltip="Keyboard shortcuts"
                    shortcut={{
                        sequences: [
                            [{ modifiers: ['Ctrl'], key: '/' }],
                            [{ modifiers: ['Meta'], key: '/' }]
                        ]
                    }}
                    variant="toolbar"
                    onClick={onToggleShortcuts}
                />
            </div>
        </div>
    )
}
