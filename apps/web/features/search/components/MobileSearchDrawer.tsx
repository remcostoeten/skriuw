'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
	Search,
	FileText,
	Folder,
	Hash,
	Pin,
	Star,
	Globe,
	CaseSensitive,
	WholeWord,
	Regex,
	Plus,
	X,
	ChevronUp
} from 'lucide-react'
import { cn, haptic } from '@skriuw/shared'
import { Button, Badge, Drawer, DrawerContent, DrawerTitle, VisuallyHidden } from '@skriuw/ui'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useAdvancedSearch, buildHighlightParts, type SearchResult } from '@/lib/search'
import type { Note } from '@/features/notes/types'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function MobileSearchDrawer({ open, onOpenChange }: Props) {
	const [query, setQuery] = React.useState('')
	const [caseSensitive, setCaseSensitive] = React.useState(false)
	const [wholeWord, setWholeWord] = React.useState(false)
	const [useRegex, setUseRegex] = React.useState(false)
	const [showOptions, setShowOptions] = React.useState(false)

	const inputRef = React.useRef<HTMLInputElement>(null)
	const scrollRef = React.useRef<HTMLDivElement>(null)

	const router = useRouter()
	const { items, createNote } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)

	const { results, isStale, isEmpty } = useAdvancedSearch(items, query, {
		caseSensitive,
		wholeWord,
		useRegex,
		limit: 20,
		searchContent: true
	})

	// Focus input when opening with slight delay for drawer animation
	React.useEffect(() => {
		if (open) {
			// Wait for drawer animation to complete
			const timer = setTimeout(() => {
				inputRef.current?.focus()
				// Scroll to top on open
				scrollRef.current?.scrollTo(0, 0)
			}, 150)
			setQuery('')
			return () => clearTimeout(timer)
		}
	}, [open])

	// Prevent body scroll when drawer is open (PWA fix)
	React.useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden'
			// Prevent iOS rubber-band scrolling
			document.body.style.position = 'fixed'
			document.body.style.width = '100%'
		} else {
			document.body.style.overflow = ''
			document.body.style.position = ''
			document.body.style.width = ''
		}
		return () => {
			document.body.style.overflow = ''
			document.body.style.position = ''
			document.body.style.width = ''
		}
	}, [open])

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			haptic.medium()
			onOpenChange(false)

			// Small delay to let drawer close animation start
			setTimeout(() => {
				if (result.item.type === 'note') {
					const url = getNoteUrl(result.item.id)
					router.push(url)
				} else if (result.item.type === 'folder') {
					router.push(`/?folder=${result.item.id}`)
				}
			}, 50)
		},
		[getNoteUrl, router, onOpenChange]
	)

	const handleCreateNote = React.useCallback(async () => {
		haptic.medium()
		const note = await createNote(query.trim() || undefined)
		onOpenChange(false)
		if (note) {
			const url = getNoteUrl(note.id)
			router.push(`${url}?focus=true`)
		}
	}, [query, createNote, getNoteUrl, router, onOpenChange])

	const handleQuickInsert = (char: string) => {
		haptic.light()
		const input = inputRef.current
		if (input) {
			const start = input.selectionStart || 0
			const end = input.selectionEnd || 0
			const newValue = query.slice(0, start) + char + query.slice(end)
			setQuery(newValue)
			// Use requestAnimationFrame for smoother cursor positioning
			requestAnimationFrame(() => {
				input.setSelectionRange(start + char.length, start + char.length)
				input.focus()
			})
		}
	}

	const handleOptionToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
		haptic.light()
		setter((v) => !v)
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='max-h-[85vh] flex flex-col outline-none'>
				<VisuallyHidden>
					<DrawerTitle>Search Notes</DrawerTitle>
				</VisuallyHidden>

				{/* Drag Handle - larger touch target for PWA */}
				<div className='flex justify-center py-3 touch-none'>
					<div className='w-12 h-1.5 rounded-full bg-muted-foreground/40' />
				</div>

				{/* Search Input - optimized touch targets */}
				<div className='px-4 pb-3 pt-safe'>
					<div className='flex items-center gap-3 bg-muted/50 rounded-2xl px-4 py-3.5 min-h-[52px]'>
						<Search
							className={cn(
								'w-5 h-5 shrink-0 transition-colors',
								isStale ? 'text-muted-foreground animate-pulse' : 'text-primary'
							)}
						/>
						<input
							ref={inputRef}
							type='text'
							inputMode='search'
							enterKeyHint='search'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder='Search notes...'
							className='flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground/60 min-w-0'
							autoComplete='off'
							autoCorrect='off'
							autoCapitalize='off'
							spellCheck={false}
						/>
						{query && (
							<Button
								variant='ghost'
								size='icon'
								className='h-10 w-10 shrink-0 -mr-1'
								onClick={() => {
									haptic.light()
									setQuery('')
									inputRef.current?.focus()
								}}
							>
								<X className='w-5 h-5' />
							</Button>
						)}
					</div>

					{/* Quick Insert Toolbar - larger touch targets */}
					<div className='flex items-center gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none'>
						<QuickInsertButton onClick={() => handleQuickInsert('tag:')} label='tag:' />
						<QuickInsertButton onClick={() => handleQuickInsert('is:')} label='is:' />
						<QuickInsertButton onClick={() => handleQuickInsert('-')} label='-' />
						<QuickInsertButton onClick={() => handleQuickInsert('/')} label='/' />
						<QuickInsertButton
							onClick={() => handleQuickInsert('created:')}
							label='created:'
						/>

						<div className='w-px h-6 bg-border mx-1 shrink-0' />

						<Button
							variant={showOptions ? 'secondary' : 'ghost'}
							size='sm'
							className='h-9 px-3 gap-1.5 shrink-0'
							onClick={() => {
								haptic.light()
								setShowOptions(!showOptions)
							}}
						>
							<ChevronUp
								className={cn(
									'w-4 h-4 transition-transform duration-200',
									showOptions && 'rotate-180'
								)}
							/>
							Options
						</Button>
					</div>

					{/* Expanded Options - larger touch targets */}
					{showOptions && (
						<div className='flex items-center gap-2 mt-3 p-2 bg-muted/30 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200'>
							<OptionToggle
								active={caseSensitive}
								onClick={() => handleOptionToggle(setCaseSensitive)}
								icon={<CaseSensitive className='w-4 h-4' />}
								label='Aa'
							/>
							<OptionToggle
								active={wholeWord}
								onClick={() => handleOptionToggle(setWholeWord)}
								icon={<WholeWord className='w-4 h-4' />}
								label='Word'
							/>
							<OptionToggle
								active={useRegex}
								onClick={() => handleOptionToggle(setUseRegex)}
								icon={<Regex className='w-4 h-4' />}
								label='.*'
							/>
						</div>
					)}
				</div>

				{/* Results - native scroll with momentum */}
				<div
					ref={scrollRef}
					className='flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] scroll-smooth'
					style={{ WebkitOverflowScrolling: 'touch' }}
				>
					{isEmpty ? (
						<EmptyState onCreateNote={handleCreateNote} />
					) : results.length > 0 ? (
						<div className='space-y-1.5 pb-4'>
							{results.map((result) => (
								<MobileResultItem
									key={result.item.id}
									result={result}
									onSelect={() => handleSelect(result)}
								/>
							))}
						</div>
					) : (
						<div className='py-16 text-center'>
							<p className='text-muted-foreground mb-4'>No results found</p>
							<Button
								variant='outline'
								size='lg'
								onClick={handleCreateNote}
								className='gap-2 h-12 px-6'
							>
								<Plus className='w-5 h-5' />
								Create note
							</Button>
						</div>
					)}
				</div>

				{/* Results Count - with safe area */}
				{results.length > 0 && (
					<div className='px-4 py-3 text-center text-xs text-muted-foreground border-t bg-background/95 backdrop-blur-sm pb-[calc(env(safe-area-inset-bottom)+0.75rem)]'>
						{results.length} result{results.length !== 1 ? 's' : ''}
					</div>
				)}
			</DrawerContent>
		</Drawer>
	)
}

function QuickInsertButton({ onClick, label }: { onClick: () => void; label: string }) {
	return (
		<Button
			variant='outline'
			size='sm'
			className='h-9 px-4 text-sm font-mono shrink-0 active:scale-95 transition-transform'
			onClick={onClick}
		>
			{label}
		</Button>
	)
}

function OptionToggle({
	active,
	onClick,
	icon,
	label
}: {
	active: boolean
	onClick: () => void
	icon: React.ReactNode
	label: string
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95',
				active
					? 'bg-primary/20 text-primary shadow-sm'
					: 'bg-background hover:bg-muted active:bg-muted'
			)}
		>
			{icon}
			<span>{label}</span>
		</button>
	)
}

function MobileResultItem({ result, onSelect }: { result: SearchResult; onSelect: () => void }) {
	const item = result.item
	const isNote = item.type === 'note'
	const note = isNote ? (item as Note) : null

	const nameMatch = result.matches.find((m) => m.field === 'name')
	const nameParts = nameMatch
		? buildHighlightParts(item.name, nameMatch.indices)
		: [{ text: item.name, highlighted: false }]

	return (
		<button
			className='flex items-center gap-3 w-full p-3.5 rounded-2xl hover:bg-muted/50 active:bg-muted active:scale-[0.98] transition-all text-left min-h-[64px]'
			onClick={onSelect}
		>
			{/* Icon - larger for touch */}
			<div
				className={cn(
					'flex items-center justify-center w-12 h-12 rounded-xl shrink-0',
					isNote ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
				)}
			>
				{'icon' in item && item.icon ? (
					<span className='text-2xl'>{item.icon}</span>
				) : isNote ? (
					<FileText className='w-6 h-6' />
				) : (
					<Folder className='w-6 h-6' />
				)}
			</div>

			{/* Content */}
			<div className='flex-1 min-w-0'>
				<div className='flex items-center gap-2'>
					<span className='font-medium truncate text-[15px]'>
						{nameParts.map((part, i) => (
							<span
								key={i}
								className={
									part.highlighted
										? 'bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5'
										: ''
								}
							>
								{part.text}
							</span>
						))}
					</span>
					{item.pinned && <Pin className='w-4 h-4 text-muted-foreground shrink-0' />}
					{note?.favorite && (
						<Star className='w-4 h-4 text-amber-500 fill-amber-500 shrink-0' />
					)}
				</div>

				{result.path.length > 0 && (
					<div className='text-sm text-muted-foreground truncate mt-1 flex items-center gap-1'>
						<Folder className='w-3.5 h-3.5' />
						{result.path.join(' / ')}
					</div>
				)}

				{note?.tags && note.tags.length > 0 && (
					<div className='flex items-center gap-1.5 mt-2 flex-wrap'>
						{note.tags.slice(0, 2).map((tag) => (
							<Badge key={tag} variant='secondary' className='text-xs h-6 px-2'>
								<Hash className='w-3 h-3 mr-0.5' />
								{tag}
							</Badge>
						))}
						{note.tags.length > 2 && (
							<span className='text-xs text-muted-foreground'>
								+{note.tags.length - 2}
							</span>
						)}
					</div>
				)}
			</div>
		</button>
	)
}

function EmptyState({ onCreateNote }: { onCreateNote: () => void }) {
	return (
		<div className='py-6 space-y-8'>
			{/* Quick Action - large touch target */}
			<button
				className='flex items-center gap-4 w-full p-5 rounded-2xl bg-primary/5 hover:bg-primary/10 active:bg-primary/15 active:scale-[0.98] transition-all text-left min-h-[80px]'
				onClick={onCreateNote}
			>
				<div className='flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary'>
					<Plus className='w-7 h-7' />
				</div>
				<div>
					<div className='font-semibold text-primary text-lg'>Create new note</div>
					<div className='text-sm text-muted-foreground mt-0.5'>Start writing</div>
				</div>
			</button>

			{/* Search Tips */}
			<div className='space-y-4'>
				<h3 className='text-sm font-semibold text-muted-foreground px-1 uppercase tracking-wide'>
					Search Tips
				</h3>
				<div className='grid gap-2.5'>
					<TipItem code='tag:work' description='Filter by tag' />
					<TipItem code='is:pinned' description='Show pinned notes' />
					<TipItem code='is:favorite' description='Show favorites' />
					<TipItem code='-exclude' description='Exclude term' />
					<TipItem code='created:>7d' description='Created recently' />
				</div>
			</div>
		</div>
	)
}

function TipItem({ code, description }: { code: string; description: string }) {
	return (
		<div className='flex items-center justify-between p-4 bg-muted/30 rounded-xl min-h-[52px]'>
			<code className='text-sm font-mono text-primary font-medium'>{code}</code>
			<span className='text-sm text-muted-foreground'>{description}</span>
		</div>
	)
}
