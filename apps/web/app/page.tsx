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

	// Cookie for alpha badge
	const { value: hideBadgeCookie, updateCookie } = useCookie('hide-alpha-badge')
	const showBadge = hideBadgeCookie !== 'true'

	// Prevent hydration mismatch
	const [hasMounted, setHasMounted] = useState(false)
	useEffect(() => {
		setHasMounted(true)
	}, [])

	// Handlers
	const handleCreateNote = async () => {
		const newNote = await createNote('Untitled')
		if (newNote) {
			const url = getNoteUrl(newNote.id)
			router.push(`${url}?focus=true`)
			notify('Note created')
		}
	}

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

	// Always show SkriuwExplanation on root "/" 
	// Users navigate to notes via sidebar
	return (
		<>
			{hasMounted && showBadge && (
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

			<div className="flex-1 flex items-center justify-center translate-y-[30%]">
				<SkriuwExplanation onCreateNote={handleCreateNote} />
			</div>
		</>
	)
}
