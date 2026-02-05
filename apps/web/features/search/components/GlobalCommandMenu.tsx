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
	Calendar,
	Clock,
	CaseSensitive,
	WholeWord,
	Regex,
	Plus,
	Settings,
	X
} from 'lucide-react'
import { cn, haptic } from '@skriuw/shared'
import {
	Dialog,
	DialogContent,
	DialogTitle,
	Button,
	Badge,
	Separator,
	Kbd,
	VisuallyHidden
} from '@skriuw/ui'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useShortcut } from '@/features/shortcuts/use-shortcut'
import { useAdvancedSearch, buildHighlightParts, type SearchResult } from '@/lib/search'
import type { Note, Folder as FolderType } from '@/features/notes/types'

type Props = {
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

export function GlobalCommandMenu({ open: controlledOpen, onOpenChange }: Props) {
	const [internalOpen, setInternalOpen] = React.useState(false)
	const open = controlledOpen ?? internalOpen
	const setOpen = onOpenChange ?? setInternalOpen

	const [query, setQuery] = React.useState('')
	const [caseSensitive, setCaseSensitive] = React.useState(false)
	const [wholeWord, setWholeWord] = React.useState(false)
	const [useRegex, setUseRegex] = React.useState(false)
	const [selectedIndex, setSelectedIndex] = React.useState(0)

	const inputRef = React.useRef<HTMLInputElement>(null)
	const listRef = React.useRef<HTMLDivElement>(null)

	const router = useRouter()
	const { items, createNote } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)

	const { results, parsedQuery, isStale, isEmpty } = useAdvancedSearch(items, query, {
		caseSensitive,
		wholeWord,
		useRegex,
		limit: 20,
		searchContent: true
	})

	// Global keyboard shortcut to open
	useShortcut('command-executor', (e) => {
		e.preventDefault()
		setOpen(true)
	})

	// Focus input when opening
	React.useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 50)
			setQuery('')
			setSelectedIndex(0)
		}
	}, [open])

	// Reset selection when results change
	React.useEffect(() => {
		setSelectedIndex(0)
	}, [results])

	// Scroll selected item into view
	React.useEffect(() => {
		if (listRef.current) {
			const selected = listRef.current.querySelector('[data-selected="true"]')
			selected?.scrollIntoView({ block: 'nearest' })
		}
	}, [selectedIndex])

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault()
					setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
					break
				case 'ArrowUp':
					e.preventDefault()
					setSelectedIndex((i) => Math.max(i - 1, 0))
					break
				case 'Enter':
					e.preventDefault()
					if (results[selectedIndex]) {
						handleSelect(results[selectedIndex])
					} else if (query.trim()) {
						handleCreateNote()
					}
					break
				case 'Escape':
					e.preventDefault()
					setOpen(false)
					break
				case 'Tab':
					// Cycle through toggle buttons
					break
			}

			// Toggle shortcuts with Alt key
			if (e.altKey) {
				switch (e.key.toLowerCase()) {
					case 'c':
						e.preventDefault()
						setCaseSensitive((v) => !v)
						break
					case 'w':
						e.preventDefault()
						setWholeWord((v) => !v)
						break
					case 'r':
						e.preventDefault()
						setUseRegex((v) => !v)
						break
				}
			}
		},
		[results, selectedIndex, query, setOpen]
	)

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			haptic.light()
			setOpen(false)

			if (result.item.type === 'note') {
				const url = getNoteUrl(result.item.id)
				router.push(url)
			} else if (result.item.type === 'folder') {
				// Navigate to folder view or expand in sidebar
				router.push(`/?folder=${result.item.id}`)
			}
		},
		[getNoteUrl, router, setOpen]
	)

	const handleCreateNote = React.useCallback(async () => {
		haptic.light()
		const note = await createNote(query.trim() || undefined)
		setOpen(false)
		if (note) {
			const url = getNoteUrl(note.id)
			router.push(`${url}?focus=true`)
		}
	}, [query, createNote, getNoteUrl, router, setOpen])



	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className="max-w-2xl p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<VisuallyHidden>
					<DialogTitle>Search Notes</DialogTitle>
				</VisuallyHidden>

				{/* Search Input "Cockpit" */}
				<div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
					<Search className={cn(
						"w-5 h-5 transition-colors",
						isStale ? "text-muted-foreground animate-pulse" : "text-primary"
					)} />

					<div className="flex-1 relative">
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Search notes, tags, or use tag:, is:, created:..."
							className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
							aria-label="Search query"
							aria-expanded={open}
							aria-controls="search-results"
							aria-activedescendant={results[selectedIndex] ? `result-${selectedIndex}` : undefined}
							role="combobox"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
						/>
					</div>

					{/* Toggle Buttons */}
					<div className="flex items-center gap-1">
						<ToggleButton
							active={caseSensitive}
							onClick={() => setCaseSensitive((v) => !v)}
							icon={<CaseSensitive className="w-4 h-4" />}
							tooltip="Case Sensitive (Alt+C)"
							shortcut="Alt+C"
						/>
						<ToggleButton
							active={wholeWord}
							onClick={() => setWholeWord((v) => !v)}
							icon={<WholeWord className="w-4 h-4" />}
							tooltip="Whole Word (Alt+W)"
							shortcut="Alt+W"
						/>
						<ToggleButton
							active={useRegex}
							onClick={() => setUseRegex((v) => !v)}
							icon={<Regex className="w-4 h-4" />}
							tooltip="Use Regex (Alt+R)"
							shortcut="Alt+R"
						/>
					</div>

					{query && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => setQuery('')}
						>
							<X className="w-4 h-4" />
						</Button>
					)}
				</div>

				{/* Query Syntax Help */}
				{parsedQuery.hasAdvancedSyntax && (
					<div className="px-4 py-2 bg-muted/30 border-b border-border/30">
						<div className="flex flex-wrap gap-1.5">
							{parsedQuery.tokens.map((token, i) => (
								<TokenBadge key={i} token={token} />
							))}
						</div>
					</div>
				)}

				{/* Results */}
				<div
					ref={listRef}
					id="search-results"
					role="listbox"
					className="max-h-[400px] overflow-y-auto"
				>
					{isEmpty ? (
						<QuickActions
							onCreateNote={handleCreateNote}
							onOpenSettings={() => {
								setOpen(false)
								router.push('/settings')
							}}
						/>
					) : results.length > 0 ? (
						<div className="py-2">
							{results.map((result, index) => (
								<SearchResultItem
									key={result.item.id}
									result={result}
									index={index}
									isSelected={index === selectedIndex}
									onSelect={() => handleSelect(result)}
									onHover={() => setSelectedIndex(index)}
								/>
							))}
						</div>
					) : (
						<div className="px-4 py-8 text-center">
							<p className="text-muted-foreground mb-3">No results found</p>
							<Button
								variant="outline"
								size="sm"
								onClick={handleCreateNote}
								className="gap-2"
							>
								<Plus className="w-4 h-4" />
								Create "{query.slice(0, 30)}{query.length > 30 ? '...' : ''}"
							</Button>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-muted/20 text-xs text-muted-foreground">
					<div className="flex items-center gap-3">
						<span className="flex items-center gap-1">
							<Kbd>↑↓</Kbd> Navigate
						</span>
						<span className="flex items-center gap-1">
							<Kbd>↵</Kbd> Open
						</span>
						<span className="flex items-center gap-1">
							<Kbd>Esc</Kbd> Close
						</span>
					</div>
					{results.length > 0 && (
						<span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

// Toggle button component
function ToggleButton({
	active,
	onClick,
	icon,
	tooltip,
	shortcut
}: {
	active: boolean
	onClick: () => void
	icon: React.ReactNode
	tooltip: string
	shortcut: string
}) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn(
				"h-7 w-7 transition-colors",
				active && "bg-primary/20 text-primary"
			)}
			onClick={onClick}
			title={tooltip}
			aria-pressed={active}
		>
			{icon}
		</Button>
	)
}

// Token badge for parsed query visualization
function TokenBadge({ token }: { token: any }) {
	const getTokenInfo = () => {
		switch (token.type) {
			case 'tag':
				return { label: `tag:${token.value}`, icon: <Hash className="w-3 h-3" />, color: 'bg-blue-500/20 text-blue-600' }
			case 'is':
				return {
					label: `is:${token.value}`,
					icon: token.value === 'pinned' ? <Pin className="w-3 h-3" /> :
						token.value === 'favorite' ? <Star className="w-3 h-3" /> :
							<Globe className="w-3 h-3" />,
					color: 'bg-purple-500/20 text-purple-600'
				}
			case 'folder':
				return { label: `in:${token.value}`, icon: <Folder className="w-3 h-3" />, color: 'bg-amber-500/20 text-amber-600' }
			case 'created':
			case 'updated':
				return {
					label: `${token.type}:${token.operator}${token.value.toLocaleDateString()}`,
					icon: token.type === 'created' ? <Calendar className="w-3 h-3" /> : <Clock className="w-3 h-3" />,
					color: 'bg-green-500/20 text-green-600'
				}
			case 'regex':
				return { label: `/${token.pattern.source}/`, icon: <Regex className="w-3 h-3" />, color: 'bg-red-500/20 text-red-600' }
			case 'text':
				if (token.negated) {
					return { label: `-${token.value}`, icon: <X className="w-3 h-3" />, color: 'bg-gray-500/20 text-gray-600' }
				}
				return null
			default:
				return null
		}
	}

	const info = getTokenInfo()
	if (!info) return null

	return (
		<Badge variant="secondary" className={cn("gap-1 text-xs font-mono", info.color)}>
			{info.icon}
			{info.label}
		</Badge>
	)
}

// Search result item
function SearchResultItem({
	result,
	index,
	isSelected,
	onSelect,
	onHover
}: {
	result: SearchResult
	index: number
	isSelected: boolean
	onSelect: () => void
	onHover: () => void
}) {
	const item = result.item
	const isNote = item.type === 'note'
	const note = isNote ? (item as Note) : null

	// Get highlighted name parts
	const nameMatch = result.matches.find((m) => m.field === 'name')
	const nameParts = nameMatch
		? buildHighlightParts(item.name, nameMatch.indices)
		: [{ text: item.name, highlighted: false }]

	// Get content preview if available
	const contentMatch = result.matches.find((m) => m.field === 'content')

	return (
		<div
			id={`result-${index}`}
			role="option"
			aria-selected={isSelected}
			data-selected={isSelected}
			className={cn(
				"flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
				isSelected ? "bg-primary/10" : "hover:bg-muted/50"
			)}
			onClick={onSelect}
			onMouseEnter={onHover}
		>
			{/* Icon */}
			<div className={cn(
				"flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
				isNote ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
			)}>
				{item.icon ? (
					<span className="text-lg">{item.icon}</span>
				) : isNote ? (
					<FileText className="w-4 h-4" />
				) : (
					<Folder className="w-4 h-4" />
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				{/* Name with highlights */}
				<div className="flex items-center gap-2">
					<span className="font-medium truncate">
						{nameParts.map((part, i) => (
							<span
								key={i}
								className={part.highlighted ? "bg-yellow-300/40 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-200 rounded px-0.5" : ""}
							>
								{part.text}
							</span>
						))}
					</span>

					{/* Badges */}
					{item.pinned && <Pin className="w-3 h-3 text-muted-foreground" />}
					{note?.favorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
					{note?.isPublic && <Globe className="w-3 h-3 text-green-500" />}
				</div>

				{/* Path or content preview */}
				<div className="text-xs text-muted-foreground truncate mt-0.5">
					{result.path.length > 0 ? (
						<span className="flex items-center gap-1">
							<Folder className="w-3 h-3 inline" />
							{result.path.join(' / ')}
						</span>
					) : contentMatch ? (
						<span>...{contentMatch.text.slice(0, 100)}...</span>
					) : null}
				</div>

				{/* Tags */}
				{note?.tags && note.tags.length > 0 && (
					<div className="flex items-center gap-1 mt-1">
						{note.tags.slice(0, 3).map((tag) => (
							<Badge key={tag} variant="outline" className="text-[10px] h-4 px-1">
								#{tag}
							</Badge>
						))}
						{note.tags.length > 3 && (
							<span className="text-[10px] text-muted-foreground">
								+{note.tags.length - 3}
							</span>
						)}
					</div>
				)}
			</div>

			{/* Score indicator (dev mode) */}
			{process.env.NODE_ENV === 'development' && (
				<span className="text-[10px] text-muted-foreground/50 tabular-nums">
					{result.score}
				</span>
			)}
		</div>
	)
}

// Quick actions when search is empty
function QuickActions({
	onCreateNote,
	onOpenSettings
}: {
	onCreateNote: () => void
	onOpenSettings: () => void
}) {
	return (
		<div className="py-2">
			<div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
				Quick Actions
			</div>
			<button
				className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
				onClick={onCreateNote}
			>
				<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
					<Plus className="w-4 h-4" />
				</div>
				<div>
					<div className="font-medium">Create new note</div>
					<div className="text-xs text-muted-foreground">Start writing a new note</div>
				</div>
				<Kbd className="ml-auto">⌘N</Kbd>
			</button>
			<button
				className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
				onClick={onOpenSettings}
			>
				<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground">
					<Settings className="w-4 h-4" />
				</div>
				<div>
					<div className="font-medium">Open settings</div>
					<div className="text-xs text-muted-foreground">Configure your preferences</div>
				</div>
				<Kbd className="ml-auto">⌘,</Kbd>
			</button>

			<Separator className="my-2" />

			<div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
				Search Syntax
			</div>
			<div className="px-4 py-2 text-xs text-muted-foreground space-y-1.5">
				<div><code className="bg-muted px-1 rounded">tag:work</code> Search by tag</div>
				<div><code className="bg-muted px-1 rounded">is:pinned</code> Filter pinned notes</div>
				<div><code className="bg-muted px-1 rounded">created:&gt;7d</code> Created in last 7 days</div>
				<div><code className="bg-muted px-1 rounded">-term</code> Exclude term</div>
				<div><code className="bg-muted px-1 rounded">/regex/</code> Regex pattern</div>
			</div>
		</div>
	)
}
