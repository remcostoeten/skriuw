import { useCallback } from 'react'
import {
	SuggestionMenuController,
	type SuggestionMenuProps,
	useBlockNoteEditor,
	type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { getCustomSlashMenuItems } from '../hooks/useCustomSlashMenu'

function SlashMenuList({ items, selectedIndex, onItemClick }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
	const activeOptionId =
		selectedIndex !== undefined && selectedIndex >= 0 ? `slash-menu-${selectedIndex}` : undefined

	if (!items.length) {
		return (
			<div className="bn-suggestion-menu empty" role="listbox" aria-label="Slash menu suggestions">
				<span className="bn-suggestion-menu__empty">No items found</span>
			</div>
		)
	}

	return (
		<div
			className="bn-suggestion-menu"
			role="listbox"
			aria-label="Slash menu suggestions"
			aria-activedescendant={activeOptionId}
		>
			{items.map((item: DefaultReactSuggestionItem, index: number) => {
				const optionId = `slash-menu-${index}`
				return (
					<button
						key={optionId}
						id={optionId}
						type="button"
						role="option"
						aria-selected={selectedIndex === index}
						className={`bn-suggestion-item ${selectedIndex === index ? 'is-selected' : ''}`}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onItemClick?.(item)}
					>
						{item.icon && <span className="bn-suggestion-item__icon">{item.icon}</span>}
						<div className="bn-suggestion-item__content">
							<span className="bn-suggestion-item__title">{item.title}</span>
							{item.subtext && <span className="bn-suggestion-item__subtext">{item.subtext}</span>}
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
			triggerCharacter="/"
			minQueryLength={0}
			getItems={getItems}
			onItemClick={handleItemClick}
			suggestionMenuComponent={SlashMenuList}
		/>
	)
}
