'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTagsQuery, useCreateTagMutation } from '../hooks/use-tags-query'
import { TagBadge } from './tag-badge'
import { cn } from '@skriuw/shared'
import { Plus } from 'lucide-react'
import type { Tag } from '../types'

type Props = {
	value: string[]
	onChange: (tags: string[]) => void
	className?: string
	placeholder?: string
}

export function TagAutocompleteInput({
	value,
	onChange,
	className,
	placeholder = 'Add tags...'
}: Props) {
	const [input, setInput] = useState('')
	const [isOpen, setIsOpen] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	const { data: allTags = [] } = useTagsQuery()
	const createTag = useCreateTagMutation()

	const filteredTags = allTags.filter((tag) => {
		const matchesSearch = tag.name.toLowerCase().includes(input.toLowerCase())
		const notAlreadySelected = !value.some((v) => v.toLowerCase() === tag.name.toLowerCase())
		return matchesSearch && notAlreadySelected
	})

	const showCreateOption =
		input.trim() && !allTags.some((t) => t.name.toLowerCase() === input.trim().toLowerCase())

	const handleAddTag = useCallback(
		async (tagName: string) => {
			const trimmed = tagName.trim()
			if (!trimmed) return
			if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return

			const existingTag = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
			if (!existingTag) {
				await createTag.mutateAsync({ name: trimmed })
			}

			onChange([...value, trimmed])
			setInput('')
			setIsOpen(false)
			setSelectedIndex(0)
		},
		[value, allTags, createTag, onChange]
	)

	const handleRemoveTag = useCallback(
		(tagName: string) => {
			onChange(value.filter((v) => v.toLowerCase() !== tagName.toLowerCase()))
		},
		[value, onChange]
	)

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const totalOptions = filteredTags.length + (showCreateOption ? 1 : 0)

		if (e.key === 'ArrowDown') {
			e.preventDefault()
			setSelectedIndex((prev) => (prev + 1) % totalOptions)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setSelectedIndex((prev) => (prev - 1 + totalOptions) % totalOptions)
		} else if (e.key === 'Enter') {
			e.preventDefault()
			if (showCreateOption && selectedIndex === filteredTags.length) {
				handleAddTag(input)
			} else if (filteredTags[selectedIndex]) {
				handleAddTag(filteredTags[selectedIndex].name)
			} else if (input.trim()) {
				handleAddTag(input)
			}
		} else if (e.key === 'Escape') {
			setIsOpen(false)
			setInput('')
		} else if (e.key === 'Backspace' && !input && value.length > 0) {
			handleRemoveTag(value[value.length - 1])
		}
	}

	useEffect(() => {
		setIsOpen(
			input.length > 0 || (document.activeElement === inputRef.current && allTags.length > 0)
		)
	}, [input, allTags.length])

	useEffect(() => {
		setSelectedIndex(0)
	}, [input])

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	const getTagColor = (tagName: string): string => {
		const tag = allTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
		return tag?.color ?? '#6366f1'
	}

	return (
		<div ref={containerRef} className={cn('relative', className)}>
			<div className='flex flex-wrap items-center gap-1.5'>
				{value.map((tagName) => (
					<TagBadge
						key={tagName}
						name={tagName}
						color={getTagColor(tagName)}
						onRemove={() => handleRemoveTag(tagName)}
					/>
				))}
				<input
					ref={inputRef}
					type='text'
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => setIsOpen(true)}
					placeholder={value.length === 0 ? placeholder : ''}
					className='flex-1 min-w-[80px] bg-transparent text-xs outline-none placeholder:text-muted-foreground/50'
				/>
			</div>

			{isOpen && (filteredTags.length > 0 || showCreateOption) && (
				<div className='absolute top-full left-0 mt-1 w-full min-w-[200px] max-h-[200px] overflow-y-auto bg-popover border border-border rounded-lg shadow-lg z-50'>
					{filteredTags.map((tag, index) => (
						<button
							key={tag.id}
							type='button'
							onClick={() => handleAddTag(tag.name)}
							className={cn(
								'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
								index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
							)}
						>
							<span
								className='w-2.5 h-2.5 rounded-full flex-shrink-0'
								style={{ backgroundColor: tag.color }}
							/>
							<span className='truncate'>{tag.name}</span>
						</button>
					))}
					{showCreateOption && (
						<button
							type='button'
							onClick={() => handleAddTag(input)}
							className={cn(
								'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-t border-border/50',
								selectedIndex === filteredTags.length
									? 'bg-accent'
									: 'hover:bg-accent/50'
							)}
						>
							<Plus className='w-3.5 h-3.5 text-muted-foreground' />
							<span>Create "{input.trim()}"</span>
						</button>
					)}
				</div>
			)}
		</div>
	)
}
