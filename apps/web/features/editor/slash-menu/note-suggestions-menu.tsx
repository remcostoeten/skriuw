import { useNoteMentionCandidates } from '../hooks/use-note-mentions'
import {
	searchNoteMentions,
	type HighlightPart,
	type NoteMentionSearchResult
} from '../utils/note-mention-search'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import {
	SuggestionMenuController,
	type SuggestionMenuProps,
	useBlockNoteEditor
} from '@blocknote/react'
import { Link2 } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@skriuw/shared'

type MentionSuggestionItem = NoteMentionSearchResult & {
	url: string
}
type MentionGetItems = (query: string) => Promise<MentionSuggestionItem[]>

const MentionMenuList = ({
	items,
	selectedIndex,
	onItemClick
}: SuggestionMenuProps<MentionSuggestionItem>) => {
	const activeOptionId =
		selectedIndex !== undefined && selectedIndex >= 0
			? `note-mention-${items[selectedIndex]?.id}`
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
				aria-label='Mention suggestions'
			>
				<span className='text-sm text-muted-foreground p-2'>No notes found</span>
			</div>
		)
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
			aria-label='Mention suggestions'
			aria-activedescendant={activeOptionId}
		>
			{items.map((item: MentionSuggestionItem, index: number) => {
				const optionId = `note-mention-${item.id}`
				const isSelected = selectedIndex === index

				return (
					<button
						key={item.id}
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
						<span
							className={cn(
								'bn-suggestion-item__icon flex items-center justify-center',
								'w-5 h-5 opacity-70',
								isSelected ? 'opacity-100' : 'group-hover:opacity-100'
							)}
							aria-hidden='true'
						>
							<Link2 size={16} />
						</span>
						<div className='flex flex-col items-start overflow-hidden min-w-0 flex-1'>
							<span className='bn-suggestion-item__title truncate font-medium leading-none mb-0.5 w-full text-left'>
								{renderHighlightedText(item.titleHighlights)}
							</span>
							{item.path && (
								<span
									className={cn(
										'bn-suggestion-item__subtext truncate text-[11px] leading-none w-full text-left',
										isSelected
											? 'text-accent-foreground/70'
											: 'text-muted-foreground'
									)}
								>
									{item.path}
								</span>
							)}
						</div>
					</button>
				)
			})}
		</div>
	)
}

function renderHighlightedText(parts: HighlightPart[]) {
	if (!parts.length) return null

	return parts.map((part, index) =>
		part.matched ? (
			<mark key={`${part.text}-${index}`}>{part.text}</mark>
		) : (
			<span key={`${part.text}-${index}`}>{part.text}</span>
		)
	)
}

export function NoteMentionSuggestionMenu() {
	// Get editor from BlockNoteContext (must be rendered inside BlockNoteView)
	const editor = useBlockNoteEditor()
	const candidates = useNoteMentionCandidates()
	const { items } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)

	const getItems = useCallback<MentionGetItems>(
		async (query) => {
			const results = searchNoteMentions(query, candidates)
			return results.map((result) => ({
				...result,
				url: getNoteUrl(result.id)
			}))
		},
		[candidates, getNoteUrl]
	)

	const handleItemClick = useCallback(
		(item: MentionSuggestionItem) => {
			if (!editor) return
			editor.createLink(item.url, item.title)
			editor.insertInlineContent(' ')
		},
		[editor]
	)

	if (!editor) return null

	return (
		<SuggestionMenuController<MentionGetItems>
			triggerCharacter='@'
			minQueryLength={0}
			getItems={getItems}
			onItemClick={handleItemClick}
			suggestionMenuComponent={MentionMenuList}
		/>
	)
}
