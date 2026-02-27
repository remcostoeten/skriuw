'use client'

import { useShortcut } from '../features/shortcuts'
import { NoteSplitView } from '@/features/notes/components/note-split-view'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { notify } from '@/lib/notify'
import { Kbd } from '@skriuw/ui'
import { useRouter } from 'next/navigation'
import { useMemo, useEffect, useCallback, useState } from 'react'

export default function Index() {
	const router = useRouter()
	const { items, createNote, isInitialLoading } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)
	const welcomeNoteId = useMemo(() => {
		if (!items.length) return null
		const welcomeNote = items.find((item) => item.id.startsWith('welcome-'))
		if (welcomeNote) return welcomeNote.id
		const firstNote = flattenNotes(items)[0]
		return firstNote?.id || null
	}, [items])

	const [hasMounted, setHasMounted] = useState(false)
	useEffect(() => {
		setHasMounted(true)
	}, [])

	const handleCreateNote = useCallback(
		async (content?: string) => {
			const newNote = await createNote('Untitled', content)
			if (newNote) {
				const url = getNoteUrl(newNote.id)
				router.push(`${url}?focus=true`)
				notify('Note created')
			}
		},
		[createNote, getNoteUrl, router]
	)

	useEffect(() => {
		if (!hasMounted) return

		const params = new URLSearchParams(window.location.search)
		const action = params.get('action')
		const sharedContent = params.get('content')

		if (action === 'new') {
			window.history.replaceState({}, '', '/')
			handleCreateNote(sharedContent || undefined)
		}
	}, [hasMounted, handleCreateNote])

	useShortcut('create-note', (e) => {
		e.preventDefault()
		handleCreateNote()
	})

	useShortcut('open-collection', (e) => {
		e.preventDefault()
		router.push('/archive')
	})

	if (!hasMounted || isInitialLoading) {
		return (
			<div className='flex-1 flex flex-col p-8 animate-pulse'>
				<div className='h-8 w-48 bg-muted/50 rounded mb-6' />
				<div className='space-y-3'>
					<div className='h-4 w-full bg-muted/30 rounded' />
					<div className='h-4 w-5/6 bg-muted/30 rounded' />
					<div className='h-4 w-4/6 bg-muted/30 rounded' />
				</div>
			</div>
		)
	}

	return (
		<div className='flex-1 flex flex-col h-full'>
			{welcomeNoteId ? (
				<NoteSplitView noteId={welcomeNoteId} />
			) : (
				<div className='flex-1 flex items-center justify-center'>
					<div className='flex flex-col items-center gap-3 text-muted-foreground'>
						<p className='text-sm'>
							Press{' '}
							<Kbd className='mx-1'>⌘N</Kbd>{' '}
							to create a note
						</p>
						<p className='text-xs text-muted-foreground/60'>
							or pick one from the sidebar
						</p>
					</div>
				</div>
			)}
		</div>
	)
}
