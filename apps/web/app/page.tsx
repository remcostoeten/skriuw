'use client'

import { useShortcut } from '../features/shortcuts'
import { SkriuwExplanation } from '@/components/landing/skriuw-explanation'
import Integrations from '@/modules/landing-page/components/integrations'
import { NoteSplitView } from '@/features/notes/components/note-split-view'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { useCookie } from '@/hooks/use-cookie'
import { useSession } from '@/lib/auth-client'
import { notify } from '@/lib/notify'
import { Icons } from '@skriuw/ui'
import { HeroBadge } from '@skriuw/ui/hero-badge'
import { useRouter } from 'next/navigation'
import { useMemo, useEffect, useCallback, useState } from 'react'

export default function Index() {
	const router = useRouter()
	const { items, createNote, isInitialLoading } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)
	const { data: session, isPending: isAuthLoading } = useSession()

	const welcomeNoteId = useMemo(() => {
		if (session || !items.length) return null
		const welcomeNote = items.find((item) => item.id.startsWith('welcome-'))
		if (welcomeNote) return welcomeNote.id
		const firstNote = flattenNotes(items)[0]
		return firstNote?.id || null
	}, [items, session])

	const { value: hideBadgeCookie, updateCookie } = useCookie('hide-alpha-badge')
	const showBadge = hideBadgeCookie !== 'true'

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

	const handleHideBadge = () => {
		updateCookie('true')
	}

	useShortcut('create-note', (e) => {
		e.preventDefault()
		handleCreateNote()
	})

	useShortcut('open-collection', (e) => {
		e.preventDefault()
		router.push('/archive')
	})

	if (!hasMounted || isAuthLoading || (!session && isInitialLoading)) {
		return null
	}

	return (
		<>
			{showBadge && (
				<div className='fixed bottom-6 w-full flex justify-center left-1/2 transform -translate-x-1/2 z-50 pointer-events-none'>
					<div className='pointer-events-auto'>
						<HeroBadge
							href='/archive'
							text='Bugs will occur! Still in alpha'
							icon={<Icons.logo className='h-4 w-4' />}
							endIcon={<Icons.close className='h-4 w-4' />}
							onCancel={handleHideBadge}
						/>
					</div>
				</div>
			)}

			{session ? (
				<div className='flex-1 flex flex-col w-full overflow-y-auto no-scrollbar'>
					<div className='min-h-[90vh] flex items-center justify-center p-4'>
						<SkriuwExplanation onCreateNote={handleCreateNote} />
					</div>
					<Integrations />
					<div className='py-12' />
				</div>
			) : (
				<div className='flex-1 flex flex-col h-full'>
					{welcomeNoteId ? (
						<NoteSplitView noteId={welcomeNoteId} />
					) : (
						<div className='flex-1 flex flex-col w-full overflow-y-auto no-scrollbar'>
							<div className='min-h-[90vh] flex items-center justify-center p-4'>
								<SkriuwExplanation onCreateNote={handleCreateNote} />
							</div>
							<Integrations />
							<div className='py-12' />
						</div>
					)}
				</div>
			)}
		</>
	)
}
