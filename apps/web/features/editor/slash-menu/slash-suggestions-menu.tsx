import { getCustomSlashMenuItems } from '../hooks/useCustomSlashMenu'
import {
	SuggestionMenuController,
	type SuggestionMenuProps,
	useBlockNoteEditor,
	type DefaultReactSuggestionItem
} from '@blocknote/react'
import { cn } from '@skriuw/shared'
import { useCallback, useEffect, useRef } from 'react'

function SlashMenuList({
	items,
	selectedIndex,
	onItemClick
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
	const activeOptionId =
		selectedIndex !== undefined && selectedIndex >= 0
			? `slash-menu-${selectedIndex}`
			: undefined

	const selectedItemRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (selectedItemRef.current) {
			selectedItemRef.current.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest'
			})
		}
	}, [selectedIndex])

	if (!items.length) {
		return null
	}

	return (
		<div
			className={cn(
				'bn-suggestion-menu flex flex-col',
				'w-[260px] max-h-[320px] overflow-y-auto',
				'bg-background/95 backdrop-blur-xl',
				'border border-border/40 shadow-2xl rounded-lg',
				'p-1.5 scrollbar-hide',
				'z-50'
			)}
			role='listbox'
			aria-label='Slash menu suggestions'
			aria-activedescendant={activeOptionId}
		>
			{items.map((item: DefaultReactSuggestionItem, index: number) => {
				const optionId = `slash-menu-${index}`
				const isSelected = selectedIndex === index
				return (
					<button
						key={optionId}
						id={optionId}
						ref={isSelected ? selectedItemRef : null}
						type='button'
						role='option'
						aria-selected={isSelected}
						className={cn(
							'bn-suggestion-item group',
							'flex items-center gap-2.5 w-full',
							'px-2 py-1.5 rounded-[4px] text-sm outline-none',
							'transition-colors duration-75',
							'select-none',
							isSelected
								? 'bg-accent text-accent-foreground'
								: 'text-foreground hover:bg-muted/50'
						)}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onItemClick?.(item)}
					>
						{item.icon && (
							<span
								className={cn(
									'bn-suggestion-item__icon flex items-center justify-center',
									'w-5 h-5 opacity-70',
									isSelected ? 'opacity-100' : 'group-hover:opacity-100'
								)}
							>
								{item.icon}
							</span>
						)}
						<div className='flex flex-col items-start overflow-hidden'>
							<span className='bn-suggestion-item__title truncate font-medium leading-none mb-0.5'>
								{item.title}
							</span>
							{item.subtext && (
								<span
									className={cn(
										'bn-suggestion-item__subtext truncate text-[11px] leading-none',
										isSelected
											? 'text-accent-foreground/70'
											: 'text-muted-foreground'
									)}
								>
									{item.subtext}
								</span>
							)}
						</div>
					</button>
				)
			})}
		</div>
	)
}

export function SlashSuggestionMenu() {
	// Get editor from BlockNoteContext (must be rendered inside BlockNoteView)
	const editor = useBlockNoteEditor()

	const getItems = useCallback(
		async (query: string) => {
			if (!editor) return []
			const allItems = getCustomSlashMenuItems(editor)

			// Filter items based on query
			if (!query) return allItems

			const lowerQuery = query.toLowerCase()
			return allItems.filter(
				(item) =>
					item.title.toLowerCase().includes(lowerQuery) ||
					item.aliases?.some((alias: string) => alias.toLowerCase().includes(lowerQuery))
			)
		},
		[editor]
	)

	const handleItemClick = useCallback(
		(item: any) => {
			if (!editor) return
			item.onItemClick?.()
		},
		[editor]
	)

	if (!editor) return null

	return (
		<SuggestionMenuController
			triggerCharacter='/'
			minQueryLength={0}
			getItems={getItems}
			onItemClick={handleItemClick}
			suggestionMenuComponent={SlashMenuList}
		/>
	)
}
