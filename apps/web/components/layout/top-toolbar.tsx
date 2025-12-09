import {
	Menu,
	PanelLeftClose,
	Search,
        ChevronLeft,
        ChevronRight,
        Code,
        Type,
        Panels,
} from 'lucide-react'

import { IconButton } from '@skriuw/ui/icons'
import { WindowControls } from './window-controls'
import { isTauriAvailable } from '@skriuw/core-logic/tauri-check'
import { cn } from '@skriuw/core-logic'
import { UserMenu } from '../auth/user-menu'

type props = {
	noteName: string
	onToggleSidebar: () => void
	onToggleDesktopSidebar?: () => void
	onSearch?: (query: string) => void
	onNavigatePrevious?: () => void
	onNavigateNext?: () => void
	canNavigatePrevious?: boolean
        canNavigateNext?: boolean
        isRawMDXMode?: boolean
        onToggleEditorMode?: () => void
        showSidebar?: boolean
        showEditorModeToggle?: boolean
        showSplitToggle?: boolean
        isSplitView?: boolean
        onToggleSplitView?: () => void
}

export function TopToolbar({
	noteName,
	onToggleSidebar,
	onToggleDesktopSidebar,
	onSearch,
	onNavigatePrevious,
	onNavigateNext,
        canNavigatePrevious = false,
        canNavigateNext = false,
        isRawMDXMode = false,
        onToggleEditorMode,
        showSidebar = true,
        showEditorModeToggle = true,
        showSplitToggle = false,
        isSplitView = false,
        onToggleSplitView,
}: props) {
        const isTauri = isTauriAvailable()

	return (
		<div
			className={cn(
				'h-10 bg-background border-b border-border flex items-center justify-between px-1.5 relative',
				isTauri && 'select-none'
			)}
			data-tauri-drag-region={isTauri ? true : undefined}
		>
			<div
				className="flex items-center gap-1.5"
				data-tauri-drag-region={isTauri ? 'false' : undefined}
			>
				{showSidebar && (
					<IconButton
						icon={<Menu className="w-4 h-4 text-muted-foreground" />}
						tooltip="Toggle sidebar"
						variant="toolbar"
						onClick={onToggleSidebar}
						className="flex lg:hidden"
					/>
				)}

				{showSidebar && (
					<IconButton
						icon={<PanelLeftClose className="w-4 h-4 text-muted-foreground" />}
						tooltip="Toggle file tree"
						variant="toolbar"
						onClick={onToggleDesktopSidebar}
						className="hidden lg:flex"
					/>
				)}

				{onNavigatePrevious && onNavigateNext && (
					<div className="flex items-center gap-0.5 ml-1">
						<IconButton
							icon={<ChevronLeft className="w-4 h-4 text-muted-foreground" />}
							tooltip="Previous note"
							variant="toolbar"
							onClick={onNavigatePrevious}
							disabled={!canNavigatePrevious}
						/>
						<IconButton
							icon={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
							tooltip="Next note"
							variant="toolbar"
							onClick={onNavigateNext}
							disabled={!canNavigateNext}
						/>
					</div>
				)}
			</div>

                        <div
                                className="flex justify-center items-center flex-1 px-1.5 py-1 mx-1.5 cursor-default"
                                data-tauri-drag-region={isTauri ? true : undefined}
                        >
                                <span className="text-[13px] text-foreground truncate max-w-[200px] sm:max-w-none">
					{noteName}
				</span>
			</div>

                        <div
                                className="flex items-center gap-1.5"
                                data-tauri-drag-region={isTauri ? 'false' : undefined}
                        >
                                {showSplitToggle && (
                                        <IconButton
                                                icon={<Panels className="w-4 h-4 text-muted-foreground" />}
                                                tooltip={isSplitView ? 'Disable split view' : 'Open split view'}
                                                variant="toolbar"
                                                onClick={onToggleSplitView}
                                        />
                                )}
                                <IconButton
                                        icon={<Search className="w-4 h-4 text-muted-foreground" />}
                                        tooltip="Search notes"
                                        variant="toolbar"
                                        onClick={() => onSearch?.('')}
				/>
				{showEditorModeToggle && (
					<IconButton
						icon={
							isRawMDXMode ? (
								<Type className="w-4 h-4 text-muted-foreground" />
							) : (
								<Code className="w-4 h-4 text-muted-foreground" />
							)
						}
						tooltip={isRawMDXMode ? 'Switch to rich editor' : 'Switch to MDX mode'}
						variant="toolbar"
						shortcut="Ctrl+M / Meta+M"
						onClick={onToggleEditorMode}
					/>
				)}
				<UserMenu />
				{isTauri && <div className="ml-2 border-l border-border h-6" />}
				{isTauri && <WindowControls />}
			</div>
		</div>
	)
}
