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
import { Button, Badge, Drawer, DrawerContent, DrawerTitle } from '@skriuw/ui'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
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

	const router = useRouter()
	const { items, createNote } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)

	const { results, isStale, isEmpty } = useAdvancedSearch(items, query, {
		caseSensitive,
		wholeWord,
		useRegex,
		limit: 15,
		searchContent: true
	})

	// Focus input when opening
	React.useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 100)
			setQuery('')
		}
	}, [open])

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			haptic.medium()
			onOpenChange(false)

			if (result.item.type === 'note') {
				const url = getNoteUrl(result.item.id)
				router.push(url)
			} else if (result.item.type === 'folder') {
				router.push(`/?folder=${result.item.id}`)
			}
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
		const input = inputRef.current
		if (input) {
			const start = input.selectionStart || 0
			const end = input.selectionEnd || 0
			const newValue = query.slice(0, start) + char + query.slice(end)
			setQuery(newValue)
			setTimeout(() => {
				input.setSelectionRange(start + char.length, start + char.length)
				input.focus()
			}, 0)
		}
		haptic.light()
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[90vh] flex flex-col">
				<VisuallyHidden>
					<DrawerTitle>Search Notes</DrawerTitle>
				</VisuallyHidden>

				{/* Drag Handle */}
				<div className="flex justify-center py-2">
					<div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
				</div>

				{/* Search Input */}
				<div className="px-4 pb-3">
					<div className="flex items-center gap-2 bg-muted/50 rounded-xl px-4 py-3">
						<Search className={cn(
							"w-5 h-5 shrink-0 transition-colors",
							isStale ? "text-muted-foreground animate-pulse" : "text-primary"
						)} />
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search notes..."
							className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
						/>
						{query && (
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8 shrink-0"
								onClick={() => setQuery('')}
							>
								<X className="w-4 h-4" />
							</Button>
						)}
					</div>

					{/* Quick Insert Toolbar */}
					<div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 -mx-1 px-1">
						<QuickInsertButton onClick={() => handleQuickInsert('tag:')} label="tag:" />
						<QuickInsertButton onClick={() => handleQuickInsert('is:')} label="is:" />
						<QuickInsertButton onClick={() => handleQuickInsert('-')} label="-" />
						<QuickInsertButton onClick={() => handleQuickInsert('/')} label="/" />
						<QuickInsertButton onClick={() => handleQuickInsert('created:')} label="created:" />

						<div className="w-px h-6 bg-border mx-1" />

						<Button
							variant={showOptions ? "secondary" : "ghost"}
							size="sm"
							className="h-8 px-3 gap-1.5"
							onClick={() => setShowOptions(!showOptions)}
						>
							<ChevronUp className={cn(
								"w-3.5 h-3.5 transition-transform",
								showOptions && "rotate-180"
							)} />
							Options
						</Button>
					</div>

					{/* Expanded Options */}
					{showOptions && (
						<div className="flex items-center gap-2 mt-2 p-2 bg-muted/30 rounded-lg">
							<OptionToggle
								active={caseSensitive}
								onClick={() => setCaseSensitive(!caseSensitive)}
								icon={<CaseSensitive className="w-4 h-4" />}
								label="Aa"
							/>
							<OptionToggle
								active={wholeWord}
								onClick={() => setWholeWord(!wholeWord)}
								icon={<WholeWord className="w-4 h-4" />}
								label="Word"
							/>
							<OptionToggle
								active={useRegex}
								onClick={() => setUseRegex(!useRegex)}
								icon={<Regex className="w-4 h-4" />}
								label=".*"
							/>
						</div>
					)}
				</div>

				{/* Results */}
				<div className="flex-1 overflow-y-auto px-4 pb-safe">
					{isEmpty ? (
						<EmptyState onCreateNote={handleCreateNote} />
					) : results.length > 0 ? (
						<div className="space-y-1">
							{results.map((result) => (
								<MobileResultItem
									key={result.item.id}
									result={result}
									onSelect={() => handleSelect(result)}
								/>
							))}
						</div>
					) : (
						<div className="py-12 text-center">
							<p className="text-muted-foreground mb-4">No results found</p>
							<Button
								variant="outline"
								onClick={handleCreateNote}
								className="gap-2"
							>
								<Plus className="w-4 h-4" />
								Create note
							</Button>
						</div>
					)}
				</div>

				{/* Results Count */}
				{results.length > 0 && (
					<div className="px-4 py-2 text-center text-xs text-muted-foreground border-t bg-background">
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
			variant="outline"
			size="sm"
			className="h-8 px-3 text-xs font-mono shrink-0"
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
				"flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
				active
					? "bg-primary/20 text-primary"
					: "bg-background hover:bg-muted"
			)}
		>
			{icon}
			<span>{label}</span>
		</button>
	)
}

function MobileResultItem({
	result,
	onSelect
}: {
	result: SearchResult
	onSelect: () => void
}) {
	const item = result.item
	const isNote = item.type === 'note'
	const note = isNote ? (item as Note) : null

	const nameMatch = result.matches.find((m) => m.field === 'name')
	const nameParts = nameMatch
		? buildHighlightParts(item.name, nameMatch.indices)
		: [{ text: item.name, highlighted: false }]

	return (
		<button
			className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors text-left"
			onClick={onSelect}
		>
			{/* Icon */}
			<div className={cn(
				"flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
				isNote ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
			)}>
				{item.icon ? (
					<span className="text-xl">{item.icon}</span>
				) : isNote ? (
					<FileText className="w-5 h-5" />
				) : (
					<Folder className="w-5 h-5" />
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="font-medium truncate">
						{nameParts.map((part, i) => (
							<span
								key={i}
								className={part.highlighted ? "bg-yellow-300/40 rounded px-0.5" : ""}
							>
								{part.text}
							</span>
						))}
					</span>
					{item.pinned && <Pin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
					{note?.favorite && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
				</div>

				{result.path.length > 0 && (
					<div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
						<Folder className="w-3 h-3" />
						{result.path.join(' / ')}
					</div>
				)}

				{note?.tags && note.tags.length > 0 && (
					<div className="flex items-center gap-1 mt-1.5 flex-wrap">
						{note.tags.slice(0, 2).map((tag) => (
							<Badge key={tag} variant="secondary" className="text-[10px] h-5">
								<Hash className="w-2.5 h-2.5 mr-0.5" />
								{tag}
							</Badge>
						))}
						{note.tags.length > 2 && (
							<span className="text-[10px] text-muted-foreground">
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
		<div className="py-6 space-y-6">
			{/* Quick Action */}
			<button
				className="flex items-center gap-3 w-full p-4 rounded-xl bg-primary/5 hover:bg-primary/10 active:bg-primary/15 transition-colors text-left"
				onClick={onCreateNote}
			>
				<div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
					<Plus className="w-6 h-6" />
				</div>
				<div>
					<div className="font-medium text-primary">Create new note</div>
					<div className="text-sm text-muted-foreground">Start writing</div>
				</div>
			</button>

			{/* Search Tips */}
			<div className="space-y-3">
				<h3 className="text-sm font-medium text-muted-foreground px-1">Search Tips</h3>
				<div className="grid gap-2">
					<TipItem code="tag:work" description="Filter by tag" />
					<TipItem code="is:pinned" description="Show pinned notes" />
					<TipItem code="is:favorite" description="Show favorites" />
					<TipItem code="-exclude" description="Exclude term" />
					<TipItem code="created:>7d" description="Created recently" />
				</div>
			</div>
		</div>
	)
}

function TipItem({ code, description }: { code: string; description: string }) {
	return (
		<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
			<code className="text-sm font-mono text-primary">{code}</code>
			<span className="text-sm text-muted-foreground">{description}</span>
		</div>
	)
}
