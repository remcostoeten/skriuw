'use client'

import { cn } from "@skriuw/shared";
import { useIsTouchDevice } from "@skriuw/shared/client";
import { IconButton } from "@skriuw/ui/icons";
import { Plus, FolderPlus, Search, X, Minimize2, Maximize2 } from "lucide-react";
import { type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ActionButton = {
	icon: ReactNode
	tooltip: string
	className?: string
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void
	onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
	disabled?: boolean
	'aria-expanded'?: boolean
	'aria-controls'?: string
}

type SearchConfig = {
	query: string
	setQuery: (value: string) => void
	close: () => void
	toggle?: () => void
	isOpen?: boolean
}

type ExpandConfig = {
	isExpanded: boolean
	onToggle: () => void
}

type ActionBarProps = {
	onCreateNote: () => void
	onCreateFolder: () => void
	searchConfig?: SearchConfig
	expandConfig?: ExpandConfig
}

function TopSectionWrapper({
	isInputVisible,
	children
}: {
	isInputVisible: boolean
	children: ReactNode
}) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 px-3.5 transition-all',
				isInputVisible && 'opacity-0 pointer-events-none'
			)}
		>
			{children}
		</div>
	)
}

export function ActionBar({
	onCreateNote,
	onCreateFolder,
	searchConfig,
	expandConfig
}: ActionBarProps) {
	const searchInputRef = useRef<HTMLInputElement>(null)
	const searchContainerRef = useRef<HTMLDivElement>(null)
	const isTouchDevice = useIsTouchDevice()

	const [localSearchVisible, setLocalSearchVisible] = useState(false)
	const isSearchOpen =
		searchConfig?.isOpen !== undefined ? searchConfig.isOpen : localSearchVisible

	useEffect(() => {
		if (isSearchOpen && searchInputRef.current) {
			searchInputRef.current.focus()
		}
	}, [isSearchOpen])

	const handleSearchToggle = useCallback(() => {
		if (searchConfig?.toggle) {
			searchConfig.toggle()
		} else {
			setLocalSearchVisible((prev) => !prev)
		}
	}, [searchConfig])

	const handleSearchClose = useCallback(() => {
		if (searchConfig?.close) {
			searchConfig.close()
		} else {
			setLocalSearchVisible(false)
			searchConfig?.setQuery('')
		}
	}, [searchConfig])

	const handleSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			searchConfig?.setQuery(event.target.value)
		},
		[searchConfig]
	)

	const handleSearchKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === 'Escape') {
				handleSearchClose()
			}
		},
		[handleSearchClose]
	)

	const handleSearchBlur = useCallback(
		(event: FocusEvent<HTMLDivElement>) => {
			const nextTarget = event.relatedTarget as Node | null
			if (
				searchContainerRef.current &&
				(!nextTarget || !searchContainerRef.current.contains(nextTarget))
			) {
				handleSearchClose()
			}
		},
		[handleSearchClose]
	)

	const icons = useMemo(
		() => ({
			search: <Search className='w-[18px] h-[18px] text-muted-foreground' />,
			plus: <Plus className='w-[18px] h-[18px] text-muted-foreground' />,
			folderPlus: <FolderPlus className='w-[18px] h-[18px] text-muted-foreground' />,
			close: <X className='w-[18px] h-[18px] text-muted-foreground' />,
			minimize: <Minimize2 className='w-[18px] h-[18px] text-muted-foreground' />,
			maximize: <Maximize2 className='w-[18px] h-[18px] text-muted-foreground' />
		}),
		[]
	)

	const buttons: ActionButton[] = useMemo(() => {
		const result: ActionButton[] = [
			{
				icon: icons.plus,
				tooltip: 'Create new note',
				onClick: onCreateNote
			},
			{
				icon: icons.folderPlus,
				tooltip: 'Create new folder',
				onClick: onCreateFolder
			}
		]

		if (expandConfig) {
			result.push({
				icon: expandConfig.isExpanded ? icons.minimize : icons.maximize,
				tooltip: expandConfig.isExpanded ? 'Collapse All' : 'Expand All',
				onClick: expandConfig.onToggle
			})
		}

		if (searchConfig) {
			result.push({
				icon: icons.search,
				tooltip: 'Search',
				onClick: (event) => {
					if (event.detail !== 0) {
						handleSearchToggle()
					}
				},
				onKeyDown: (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault()
						handleSearchToggle()
					}
				},
				'aria-expanded': isSearchOpen,
				'aria-controls': 'notesSearch'
			})
		}

		return result
	}, [
		expandConfig,
		handleSearchToggle,
		icons,
		isSearchOpen,
		onCreateFolder,
		onCreateNote,
		searchConfig
	])

	return (
		<div
			className={cn(
				'relative top-0 flex flex-col items-center justify-center min-h-10 w-full border-b border-sidebar-border bg-sidebar-background overflow-hidden',
				isTouchDevice && 'min-h-12'
			)}
		>
			<TopSectionWrapper isInputVisible={isSearchOpen}>
				{buttons.map((button) => (
					<IconButton
						key={button.tooltip}
						icon={button.icon}
						tooltip={button.tooltip}
						variant='action-bar'
						className={cn(button.className, isTouchDevice && 'h-10 w-10 rounded-lg')}
						onClick={button.onClick}
						disabled={button.disabled}
						onKeyDown={button.onKeyDown}
						aria-expanded={button['aria-expanded']}
						aria-controls={button['aria-controls']}
					/>
				))}
			</TopSectionWrapper>

			{searchConfig && (
				<div
					ref={searchContainerRef}
					className={cn(
						'absolute pb-[0.5px] flex flex-row items-center justify-center',
						'w-full h-full px-[5px] gap-1 shrink-0',
						'transform transition-all duration-200',
						isSearchOpen
							? 'translate-y-0 opacity-100'
							: 'translate-y-12 opacity-0 pointer-events-none'
					)}
					onBlur={handleSearchBlur}
				>
					<div
						className={cn(
							'rounded-md w-full flex items-center justify-start bg-sidebar-background pl-2 pr-1 gap-0.5 border border-sidebar-border focus-within:ring-1 focus-within:ring-sidebar-ring transition-all',
							isTouchDevice && 'h-12 px-3 py-2 gap-2 rounded-lg'
						)}
					>
						<input
							ref={searchInputRef}
							id='notesSearch'
							className={cn(
								'w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-sm text-sidebar-foreground',
								isTouchDevice && 'h-8 text-sm'
							)}
							type='text'
							placeholder='Search...'
							aria-label='Search notes'
							autoComplete='off'
							autoCorrect='off'
							value={searchConfig.query}
							onChange={handleSearchChange}
							onKeyDown={handleSearchKeyDown}
						/>
						<IconButton
							icon={icons.close}
							tooltip='Close'
							variant='action-bar'
							onClick={handleSearchClose}
							className={cn('w-6 h-6', isTouchDevice && 'w-9 h-9 rounded-lg')}
						/>
					</div>
				</div>
			)}
		</div>
	)
}
