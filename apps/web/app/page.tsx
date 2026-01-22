'use client'

import { useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useShortcut } from '../features/shortcuts'
import { useCookie } from '@/hooks/use-cookie'
import { useUIStore } from '@/stores/ui-store'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { notify } from '@/lib/notify'

import { Icons } from '@skriuw/ui'
import { HeroBadge } from '@skriuw/ui/hero-badge'
import { SkriuwExplanation } from '@/components/landing/skriuw-explanation'
import { useSession } from '@/lib/auth-client'
import { NoteSplitView } from '@/features/notes/components/note-split-view'

/**
 * Root page component - shows welcome screen on first load.
 * 
 * This page shows SkriuwExplanation and lets the user interact with it.
 * It does NOT auto-redirect - users navigate via sidebar clicks.
 */
export default function Index() {
	const pathname = usePathname()
	const router = useRouter()
	const { items, createNote, isInitialLoading } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)
	const { data: session, isPending: isAuthLoading } = useSession()

	// Find the welcome note for guests (usually the first note)
	const welcomeNoteId = useMemo(() => {
		if (session || !items.length) return null
		// Look for the seeded welcome note first
		const welcomeNote = items.find(item => item.id.startsWith('welcome-'))
		if (welcomeNote) return welcomeNote.id
		// Fallback to the first note if no welcome note found
		const firstNote = flattenNotes(items)[0]
		return firstNote?.id || null
	}, [items, session])

	// Cookie for alpha badge
	const { value: hideBadgeCookie, updateCookie } = useCookie('hide-alpha-badge')
	// Only show badge if cookie not set 
	const showBadge = hideBadgeCookie !== 'true'

	// Prevent hydration mismatch
	const [hasMounted, setHasMounted] = useState(false)
	useEffect(() => {
		setHasMounted(true)
	}, [])

	// Handlers
	const handleCreateNote = useCallback(async (content?: string) => {
		const newNote = await createNote('Untitled', content)
		if (newNote) {
			const url = getNoteUrl(newNote.id)
			router.push(`${url}?focus=true`)
			notify('Note created')
		}
	}, [createNote, getNoteUrl, router])

	// Handle PWA Actions (Shortcuts & Share Target)
	useEffect(() => {
		if (!hasMounted) return

		const params = new URLSearchParams(window.location.search)
		const action = params.get('action')
		const sharedContent = params.get('content')

		if (action === 'new') {
			// Clear params and create note
			window.history.replaceState({}, '', '/')
			handleCreateNote(sharedContent || undefined)
		}
	}, [hasMounted, handleCreateNote])

	const handleHideBadge = () => {
		updateCookie('true')
	}

	// Keyboard shortcuts
	useShortcut('create-note', (e) => {
		e.preventDefault()
		handleCreateNote()
	})

	useShortcut('open-collection', (e) => {
		e.preventDefault()
		router.push('/archive')
	})

	// Show nothing while checking auth to prevent flash
	// Also wait for items to load if we are guest (to find the note)
	if (!hasMounted || isAuthLoading || (!session && isInitialLoading)) {
		return null
	}

	return (
		<>
			{showBadge && (
				<div className="fixed bottom-6 w-full flex justify-center left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
					<div className="pointer-events-auto">
						<HeroBadge
							href="/archive"
							text="Bugs will occur! Still in alpha"
							icon={<Icons.logo className="h-4 w-4" />}
							endIcon={<Icons.close className="h-4 w-4" />}
							onCancel={handleHideBadge}
						/>
					</div>
				</div>
			)}

			{session ? (
				// Authenticated: Show Branding / Explanation
				<div className="flex-1 flex items-center justify-center translate-y-[30%]">
					<SkriuwExplanation onCreateNote={handleCreateNote} />
				</div>
			) : (
				// Guest: Show Full Editor with Welcome Note
				<div className="flex-1 flex flex-col h-full">
					{welcomeNoteId ? (
						<NoteSplitView noteId={welcomeNoteId} />
					) : (
						// Fallback if no welcome note found (shouldn't happen due to seeding)
						<div className="flex-1 flex items-center justify-center">
							<SkriuwExplanation onCreateNote={handleCreateNote} />
						</div>
					)}
				</div>
			)}
		</>
	)
}
