'use client'

import { Suspense, lazy, useMemo, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useShortcut, shortcut } from '../features/shortcuts'
import { useCookie } from '@/hooks/use-cookie'
import { useUIStore } from '@/stores/ui-store'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'

import { IndexSkeleton } from '../components/pages/index-skeleton'

const NoteEditor = lazy(() =>
	import('../features/editor/components/note-editor').then((mod) => ({
		default: mod.NoteEditor,
	}))
)

import { Icons } from '@skriuw/ui'
import { HeroBadge } from '@skriuw/ui/hero-badge'
import { SkriuwExplanation } from '@/components/landing/skriuw-explanation'

export default function Index() {
	const { value: hideBadgeCookie, updateCookie } = useCookie('hide-alpha-badge')
	const showBadge = hideBadgeCookie !== 'true'

	const hideBadge = () => updateCookie('true')
	const pathname = usePathname()
	const router = useRouter()
	const { items, createNote, isInitialLoading } = useNotesContext()
	const { resolveNoteId, getNoteUrl } = useNoteSlug(items)
	const { lastActiveNoteId, setLastActiveNote } = useUIStore()

	// Prevent hydration flash by waiting for client mount
	const [hasMounted, setHasMounted] = useState(false)
	useEffect(() => {
		setHasMounted(true)
	}, [])

	const isNoteRoute = pathname.startsWith('/note/')
	const isBaseNoteRoute = pathname === '/note'
	const slugOrId = isNoteRoute ? pathname.split('/note/')[1]?.split('?')[0] : null
	const noteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

	// Get all notes (flattened)
	const allNotes = useMemo(() => flattenNotes(items), [items])

	// Track the active note ID
	useEffect(() => {
		if (noteId) {
			setLastActiveNote(noteId)
		}
	}, [noteId, setLastActiveNote])

	// Smart navigation when visiting /note
	useEffect(() => {
		if (isBaseNoteRoute && !isInitialLoading) {
			if (allNotes.length === 0) {
				// No notes: stay on /note to show SkriuwExplanation
				return
			} else if (allNotes.length === 1) {
				// Single note: navigate to it
				const singleNote = allNotes[0]
				router.replace(getNoteUrl(singleNote.id))
			} else if (lastActiveNoteId) {
				// Multiple notes: navigate to last active note if it exists
				const noteExists = allNotes.some(note => note.id === lastActiveNoteId)
				if (noteExists) {
					router.replace(getNoteUrl(lastActiveNoteId))
				} else {
					// Last active note was deleted, navigate to first note
					router.replace(getNoteUrl(allNotes[0].id))
				}
			} else {
				// Multiple notes but no last active: navigate to first note
				router.replace(getNoteUrl(allNotes[0].id))
			}
		}
	}, [isBaseNoteRoute, isInitialLoading, allNotes, lastActiveNoteId, router, getNoteUrl])

	async function handleCreateNote() {
		const newNote = await createNote('Untitled')
		if (newNote) {
			const url = getNoteUrl(newNote.id)
			router.push(`${url}?focus=true`)
			toast.success('Note created')
		}
	}

	function handleOpenCollection() {
		router.push('/archive')
	}

	useShortcut('create-note', (e) => {
		e.preventDefault()
		handleCreateNote()
	})

	useShortcut('open-collection', (e) => {
		e.preventDefault()
		handleOpenCollection()
	})

	return (
		<>
			{!noteId && showBadge && (
				<div className="fixed bottom-6 w-full flex justify-center left-1/2 transform -translate-x-1/2 z-50">
					<HeroBadge
						href="/archive"
						text="Bugs will occur! Still in alpha"
						icon={<Icons.logo className="h-4 w-4" />}
						endIcon={<Icons.close className="h-4 w-4" />}
						onCancel={hideBadge}
					/>
				</div>
			)}
			{!noteId ? (
				<div className="flex-1 flex items-center justify-center translate-y-[30%]">
					{!hasMounted || isInitialLoading ? (
						<IndexSkeleton />
					) : (
						<SkriuwExplanation
							onCreateNote={handleCreateNote}
							onOpenCollection={handleOpenCollection}
						/>
					)}
				</div>
			) : (
				<Suspense
					fallback={
						<div className="flex-1 flex items-center justify-center">
							<div className="text-muted-foreground">Loading editor...</div>
						</div>
					}
				>
					<NoteEditor noteId={noteId} className="overflow-y-auto" />
				</Suspense>
			)}
		</>
	)
}
