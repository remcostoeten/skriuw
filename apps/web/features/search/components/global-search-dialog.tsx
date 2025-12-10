import { useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Folder, Hash } from 'lucide-react'
import { Dialog, DialogContent } from '@skriuw/ui/dialog'
import { AnimatedNumber } from '@skriuw/ui/animated-number'
import { DataCommand, type CommandDataItem } from './data-command'
import { fetchNotes, fetchFolders, fetchOneNote, fetchOneFolder } from '../api/fetch-notes'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import type { Note, Folder as FolderType } from '@/features/notes/types'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function GlobalSearchDialog({ open, onOpenChange }: Props) {
	const router = useRouter()
	const { items } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)

	const parseNote = useCallback(
		(note: Note): CommandDataItem => ({
			label: note.name,
			value: note.id,
			icon: <FileText className="h-4 w-4 text-muted-foreground" />,
			onSelect: () => {
				router.push(getNoteUrl(note.id))
			},
		}),
		[router, getNoteUrl]
	)

	const parseFolder = useCallback(
		(folder: FolderType): CommandDataItem => ({
			label: folder.name,
			value: folder.id,
			icon: <Folder className="h-4 w-4 text-muted-foreground" />,
			loadItems: async ({ search }) => {
				const [notes, subFolders] = await Promise.all([
					fetchNotes({ parentFolderId: folder.id, search }),
					fetchFolders({ parentFolderId: folder.id, search }),
				])

				return [...subFolders.map((f) => parseFolder(f)), ...notes.map((n) => parseNote(n))]
			},
			loadOneItem: async (itemId: string) => {
				// Try to fetch as folder first, then as note
				const fetchedFolder = await fetchOneFolder(itemId)
				if (fetchedFolder) {
					return parseFolder(fetchedFolder)
				}
				const note = await fetchOneNote(itemId)
				if (note) {
					return parseNote(note)
				}
				throw new Error('Item not found')
			},
			onSelect: () => {
				// Could navigate to folder view if implemented
				router.push('/')
			},
		}),
		[router, parseNote]
	)

	const rootItems = useMemo<CommandDataItem[]>(
		() => [
			{
				icon: <Folder className="h-4 w-4 text-muted-foreground" />,
				label: 'All Notes',
				value: 'all-notes',
				searchPlaceholder: 'Search all notes...',
				loadItems: async ({ search }) => {
					const [notes, folders] = await Promise.all([
						fetchNotes({ search }),
						fetchFolders({ search }),
					])

					return [...folders.map((f) => parseFolder(f)), ...notes.map((n) => parseNote(n))]
				},
				onSelect: () => {
					router.push('/')
				},
			},
			{
				icon: <Hash className="h-4 w-4 text-muted-foreground" />,
				label: (
					<span className="flex items-center gap-2">
						Animated Number
						<AnimatedNumber value="42" className="text-sm text-muted-foreground" />
					</span>
				),
				value: 'animated-number',
				searchPlaceholder: 'Insert animated number...',
				loadItems: async ({ search }) => {
					const numberExamples = [
						{ label: 'Insert 123', value: '123' },
						{ label: 'Insert 2024', value: '2024' },
						{ label: 'Insert 999', value: '999' },
						{ label: 'Insert 42', value: '42' },
						{ label: 'Insert 1000', value: '1000' },
					].filter((item) =>
						search ? item.label.toLowerCase().includes(search.toLowerCase()) : true
					)

					return numberExamples.map((item) => ({
						label: (
							<span className="flex items-center gap-2">
								{item.label}
								<AnimatedNumber value={item.value} className="text-sm text-muted-foreground" />
							</span>
						),
						value: `animated-${item.value}`,
						onSelect: () => {
							// Copy to clipboard for now - could be enhanced to insert into editor
							navigator.clipboard.writeText(`<AnimatedNumber value="${item.value}" />`)
							onOpenChange(false)
						},
					}))
				},
				onSelect: () => {
					// Default action - insert a sample number
					navigator.clipboard.writeText('<AnimatedNumber value="123" />')
					onOpenChange(false)
				},
			},
		],
		[router, parseNote, parseFolder]
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 max-w-2xl">
				<DataCommand items={rootItems} onClose={() => onOpenChange(false)} />
			</DialogContent>
		</Dialog>
	)
}
