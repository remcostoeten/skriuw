'use client'

import { Suspense, lazy, useMemo, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useShortcut } from '../features/shortcuts'
import { useCookie } from '@/hooks/use-cookie'
import { useUIStore } from '@/stores/ui-store'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'

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

	const isNoteRoute = pathname.startsWith('/note/')
	const isBaseNoteRoute = pathname === '/note'
	const slugOrId = isNoteRoute ? pathname.split('/note/')[1]?.split('?')[0] : null
	const noteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

	// Get all notes (flattened)
	const allNotes = useMemo(() => flattenNotes(items), [items])

	const navigateToPreferredNote = useCallback(() => {
		if (allNotes.length === 0) return false

		let targetNoteId = allNotes[0].id

		if (allNotes.length === 1) {
			targetNoteId = allNotes[0].id
		} else if (allNotes.length > 1 && lastActiveNoteId) {
		} else if (lastActiveNoteId) {
			const noteExists = allNotes.some(note => note.id === lastActiveNoteId)
			if (noteExists) {
				targetNoteId = lastActiveNoteId
			}
		}

		router.replace(getNoteUrl(targetNoteId))
		return true
	}, [allNotes, lastActiveNoteId, router, getNoteUrl])

	// Track the active note ID
	useEffect(() => {
		if (noteId) {
			setLastActiveNote(noteId)
		}
	}, [noteId, setLastActiveNote])

	// Smart navigation when visiting /note
	useEffect(() => {
		if (!isBaseNoteRoute || isInitialLoading) return
		navigateToPreferredNote()
	}, [isBaseNoteRoute, isInitialLoading, navigateToPreferredNote])

	// Redirect from root to the best available note once data is ready
	useEffect(() => {
		if (pathname !== '/' || isInitialLoading || noteId) return
		navigateToPreferredNote()
	}, [pathname, isInitialLoading, noteId, navigateToPreferredNote])

	const handleCreateNote = async () => {
		const newNote = await createNote('Untitled')
		if (newNote) {
			const url = getNoteUrl(newNote.id)
			router.push(`${url}?focus=true`)
			notify('Note created')
		}
	}

	const handleOpenCollection = () => {
		router.push('/archive')
	}

	const handleHideBadge = () => {
		updateCookie('true')
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
						onCancel={handleHideBadge}
					/>
				</div>
			)}
			{!noteId ? (
				<div className="flex-1 flex items-center justify-center translate-y-[30%]">
					{allNotes.length === 0 ? (
						<SkriuwExplanation
							onCreateNote={handleCreateNote}
						/>
					) : null}
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
