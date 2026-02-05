import { useTagMentions } from "../hooks/use-tag-mentions"
import { useCreateTagMutation } from "@/features/tags"
import { SuggestionMenuController, type SuggestionMenuProps, useBlockNoteEditor } from "@blocknote/react"
import { Hash, Plus } from "lucide-react"
import { useCallback } from "react"
import type { MouseEvent } from "react"

type TagOption = {
	id: string
	name: string
	color: string
	key: string
	isCreate?: boolean
}

type TagGet = (query: string) => Promise<TagOption[]>

type Props = SuggestionMenuProps<TagOption>

function TagMenu({ items, selectedIndex, onItemClick }: Props) {
	const activeId =
		selectedIndex !== undefined && selectedIndex >= 0
			? `tag-mention-${items[selectedIndex]?.id}`
			: undefined

	if (!items.length) {
		return (
			<div className='skriuw-mention-menu empty' role='listbox' aria-label='Tag suggestions'>
				<span className='skriuw-mention-menu__empty'>No tags found</span>
			</div>
		)
	}

	return (
		<div
			className='skriuw-mention-menu'
			role='listbox'
			aria-label='Tag suggestions'
			aria-activedescendant={activeId}
		>
			{items.map(function mapItem(item, index) {
				const optionId = `tag-mention-${item.id}`
				const isActive = selectedIndex === index
				return (
					<button
						key={item.id}
						id={optionId}
						type='button'
						role='option'
						aria-selected={isActive}
						className={`skriuw-mention-menu__item ${isActive ? 'is-selected' : ''}`}
						onMouseDown={handleMouseDown}
						onClick={function onClick() {
							onItemClick?.(item)
						}}
					>
						<span className='skriuw-mention-menu__icon' aria-hidden='true'>
							{item.isCreate ? <Plus size={14} /> : <Hash size={14} />}
						</span>
						<span className='skriuw-mention-menu__content'>
							<span className='skriuw-mention-menu__title'>
								<span
									className='skriuw-tag-mention'
									style={{
										backgroundColor: `${item.color}20`,
										borderColor: `${item.color}40`,
										color: item.color
									}}
								>
									{item.isCreate ? `Create new tag: ${item.name}` : item.name}
								</span>
							</span>
						</span>
					</button>
				)
			})}
		</div>
	)
}

function handleMouseDown(event: MouseEvent<HTMLButtonElement>) {
	event.preventDefault()
}

function buildItems(query: string, items: TagOption[]): TagOption[] {
	const clean = query.trim().toLowerCase()
	const results = clean
		? items.filter(function filterTag(item) {
			return item.key.includes(clean)
		})
		: items
	const sliced = results.slice(0, 8)
	const exact = clean
		? items.some(function matchTag(item) {
				return item.key === clean
			})
		: false
	if (clean && !exact) {
		return [
			...sliced,
			{
				id: `create-${clean}`,
				name: query.trim(),
				color: '#6366f1',
				key: clean,
				isCreate: true
			}
		]
	}
	return sliced
}

export function TagSuggestionMenu() {
	const editor = useBlockNoteEditor()
	const tags = useTagMentions()
	const createTag = useCreateTagMutation()

	const getItems = useCallback<TagGet>(
		async function getItems(query) {
			const options = buildItems(query, tags)
			return options
		},
		[tags]
	)

	const handleItem = useCallback(
		async function handleItem(item: TagOption) {
			if (!editor) return
			if (item.isCreate) {
				const name = item.name.trim()
				if (!name) return
				const created = await createTag.mutateAsync({ name })
				editor.insertInlineContent([
					{
						type: 'tag',
						props: {
							tagId: created.id,
							tagName: created.name,
							tagColor: created.color
						}
					},
					' '
				])
				return
			}

			editor.insertInlineContent([
				{
					type: 'tag',
					props: {
						tagId: item.id,
						tagName: item.name,
						tagColor: item.color
					}
				},
				' '
			])
		},
		[editor, createTag]
	)

	if (!editor) return null

	return (
		<SuggestionMenuController<TagGet>
			triggerCharacter='#'
			minQueryLength={0}
			getItems={getItems}
			onItemClick={handleItem}
			suggestionMenuComponent={TagMenu}
		/>
	)
}
