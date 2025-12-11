import {
	Menu,
	PanelLeftClose,
	ChevronLeft,
	ChevronRight,
	Code,
	Type,
	Square,
	SplitSquareHorizontal,
} from 'lucide-react'

import { IconButton } from '@skriuw/ui/icons'
import { WindowControls } from './window-controls'
import { isTauriAvailable } from '@skriuw/core-logic/tauri-check'
import { useIsTouchDevice } from '@skriuw/core-logic/use-is-touch-device'
import { cn } from '@skriuw/shared'
import { UserMenu } from '../auth/user-menu'

type props = {
	noteName: string
	onToggleSidebar: () => void
	onToggleDesktopSidebar?: () => void
	onNavigatePrevious?: () => void
	onNavigateNext?: () => void
	canNavigatePrevious?: boolean
	canNavigateNext?: boolean
	isRawMDXMode?: boolean
	onToggleEditorMode?: () => void
	showSidebar?: boolean
	showEditorModeToggle?: boolean
	showSplitToggle?: boolean
	isSplitViewActive?: boolean
	onSplitToggle?: () => void
	splitOrientation?: 'single' | 'vertical' | 'horizontal'
}

export function TopToolbar({
	noteName,
	onToggleSidebar,
	onToggleDesktopSidebar,
	onNavigatePrevious,
	onNavigateNext,
	canNavigatePrevious = false,
	canNavigateNext = false,
	isRawMDXMode = false,
	onToggleEditorMode,
	showSidebar = true,
	showEditorModeToggle = true,
	showSplitToggle = false,
	isSplitViewActive = false,
	onSplitToggle,
	splitOrientation = 'single',
}: props) {
	const isTauri = isTauriAvailable()
	const isTouchDevice = useIsTouchDevice()

	return (
		<div
			className={cn(
				'bg-background border-b border-border flex items-center justify-between relative',
				isTouchDevice ? 'h-12 px-2 gap-1.5' : 'h-10 px-1.5',
				isTauri && 'select-none'
			)}
			data-tauri-drag-region={isTauri ? true : undefined}
		>
			<div
				className={cn('flex items-center gap-1.5', isTouchDevice && 'gap-2')}
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
				className={cn(
					'flex justify-center items-center flex-1 px-1.5 py-1 mx-1.5 cursor-default',
					isTouchDevice && 'px-3'
				)}
				data-tauri-drag-region={isTauri ? true : undefined}
			>
				<span
					className={cn(
						'text-[13px] text-foreground truncate max-w-[200px] sm:max-w-none text-center',
						isTouchDevice && 'text-sm'
					)}
				>
					{noteName}
				</span>
			</div>

			<div
				className={cn('flex items-center gap-1.5', isTouchDevice && 'gap-2 pr-[env(safe-area-inset-right)]')}
				data-tauri-drag-region={isTauri ? 'false' : undefined}
			>
				{showSplitToggle && (
					<IconButton
						icon={
							splitOrientation === 'single' ? (
								<SplitSquareHorizontal className="w-4 h-4 text-muted-foreground" />
							) : (
								<Square className="w-4 h-4 text-muted-foreground" />
							)
						}
						tooltip={
							splitOrientation === 'single'
								? 'Enable split view'
								: 'Close split view'
						}
						variant="toolbar"
						className={cn(
							'transition-colors',
							isSplitViewActive && 'bg-accent/50 text-foreground'
						)}
						active={isSplitViewActive}
						onClick={onSplitToggle}
					/>
				)}
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
