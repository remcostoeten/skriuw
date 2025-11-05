'use client'

import type { Note } from '@/api/db/schema'
import { NoteEditor } from '@/components/editor/note-editor'
import { Sidebar as FileTreeSidebar } from '@/components/file-tree/sidebar'
import { NotesViewSkeleton } from '@/components/shells/skeletons/notes-view-skeleton'
import { useCreateNote } from '@/modules/notes/api/mutations/create'
import { useDestroyNote } from '@/modules/notes/api/mutations/destroy'
import { useGetNotes } from '@/modules/notes/api/queries/get-notes'
import { DockManager } from '@/utils/dock-utils'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export default function NotesView() {
	const { notes, isLoading } = useGetNotes()
	const { createNote } = useCreateNote()
	const { destroyNote } = useDestroyNote()
	const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
	const pendingNoteIdRef = useRef<string | null>(null)

	// Use state to store the selected note, but only update when it actually changes
	const [selectedNote, setSelectedNote] = useState<Note | null>(null)
	const prevNoteRef = useRef<Note | null>(null)

	// Update selectedNote only when the note ID changes or when content/title actually changes
	useEffect(() => {
		if (!selectedNoteId) {
			if (prevNoteRef.current !== null) {
				setSelectedNote(null)
				prevNoteRef.current = null
			}
			return
		}

		const note = notes.find((n: Note) => n.id === selectedNoteId)
		if (!note) {
			if (prevNoteRef.current !== null) {
				setSelectedNote(null)
				prevNoteRef.current = null
			}
			return
		}

		// Only update if note ID changed or if content/title actually changed
		const noteChanged =
			!prevNoteRef.current ||
			prevNoteRef.current.id !== note.id ||
			prevNoteRef.current.content !== note.content ||
			prevNoteRef.current.title !== note.title

		if (noteChanged) {
			setSelectedNote(note)
			prevNoteRef.current = note
		}
	}, [selectedNoteId, notes])

	// Memoize the onNoteSelect callback to prevent NoteEditor from re-rendering
	const handleNoteSelect = useMemo(
		() => (noteId: Note['id']) => {
			setSelectedNoteId(noteId)
		},
		[]
	)

	useEffect(() => {
		DockManager.setBadge(notes.length)
	}, [notes])

	useEffect(() => {
		if (pendingNoteIdRef.current) {
			const note = notes.find(
				(n: Note) => n.id === pendingNoteIdRef.current
			)
			if (note) {
				setSelectedNoteId(note.id)
				pendingNoteIdRef.current = null
			}
		}
	}, [notes])

	useEffect(() => {
		const handleToggleSearch = () => {
			const searchToggleEvent = new CustomEvent('search:toggle')
			window.dispatchEvent(searchToggleEvent)
		}

		const handleCloseSearch = () => {
			const searchCloseEvent = new CustomEvent('search:close')
			window.dispatchEvent(searchCloseEvent)
		}

		window.addEventListener('menu:toggle-search', handleToggleSearch)
		window.addEventListener('menu:close-search', handleCloseSearch)

		return () => {
			window.removeEventListener('menu:toggle-search', handleToggleSearch)
			window.removeEventListener('menu:close-search', handleCloseSearch)
		}
	}, [])

	async function handleCreateNote() {
		const suffix = '.md'
		const amount = notes.length + 1
		const title = `Untitled ${amount}${suffix}`

		const rootNotes = notes.filter((n: Note) => !(n.folder as any))
		const position =
			rootNotes.length > 0
				? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1
				: 0

		const note = await createNote({ title, content: '', position })
		setSelectedNoteId((note as Note).id)
	}

	async function handleCreateNoteFromSidebar(noteId?: string) {
		if (noteId) {
			const note = notes.find((n: Note) => n.id === noteId)
			if (note) {
				setSelectedNoteId(note.id)
			} else {
				pendingNoteIdRef.current = noteId
			}
		} else {
			await handleCreateNote()
		}
	}

	function handleNoteSelectFromSidebar(noteId: string) {
		setSelectedNoteId(noteId)
	}

	async function handleDeleteNote(id: string) {
		await destroyNote(id)
		if (selectedNoteId === id) {
			setSelectedNoteId(null)
		}
	}

	if (isLoading) {
		return <NotesViewSkeleton />
	}

	return (
		<div
			className="flex h-screen sm:h-screen bg-background"
			style={{ height: 'calc(100vh - env(safe-area-inset-bottom))' }}
		>
			<FileTreeSidebar
				onNoteSelect={handleNoteSelectFromSidebar}
				onNoteCreate={handleCreateNoteFromSidebar}
				selectedNoteId={selectedNote?.id}
			/>

			<div className="flex-1 relative sm:ml-[220px] ml-0">
				{selectedNote ? (
					<NoteEditor
						note={selectedNote}
						onNoteSelect={handleNoteSelect}
					/>
				) : (
					<div className="h-full flex items-center justify-center text-muted-foreground">
						<p className="text-sm">
							Select a note or create a new one
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
