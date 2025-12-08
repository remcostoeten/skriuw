'use client'

import { Suspense, lazy, useMemo, useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { EmptyState } from '../components/ui/empty-state'

import { useNoteSlug } from '../features/notes/hooks/use-note-slug'
import { useNotesWithSuspense } from '../features/notes/hooks/useNotesWithSuspense'
import { useShortcut, shortcut } from '../features/shortcuts'

import { IndexSkeleton } from '../components/pages/index-skeleton'

const NoteEditor = lazy(() =>
	import('../features/editor/components/note-editor').then((mod) => ({
		default: mod.NoteEditor,
	}))
)

import { Icons } from '@skriuw/ui'
import HeroBadge from '@skriuw/ui/hero-badge'

// Cookie handling functions
const BADGE_COOKIE_NAME = 'hide-alpha-badge'

function setHideBadgeCookie() {
	if (typeof window !== 'undefined') {
		document.cookie = `${BADGE_COOKIE_NAME}=true; max-age=${60 * 60 * 24 * 30}; path=/; secure; samesite=strict`
	}
}

function getHideBadgeCookie(): boolean {
	if (typeof window === 'undefined') return false

	const cookies = document.cookie.split(';')
	for (const cookie of cookies) {
		const [name, value] = cookie.trim().split('=')
		if (name === BADGE_COOKIE_NAME) {
			return value === 'true'
		}
	}
	return false
}

export default function Index() {
	const [showBadge, setShowBadge] = useState(true)

	useEffect(() => {
		// Check cookie on mount
		setShowBadge(!getHideBadgeCookie())
	}, [])
	const pathname = usePathname()
	const router = useRouter()
	const { items, createNote, isInitialLoading } = useNotesWithSuspense()
	const { resolveNoteId, getNoteUrl } = useNoteSlug(items)

	const isNoteRoute = pathname.startsWith('/note/')
	const slugOrId = isNoteRoute ? pathname.split('/note/')[1]?.split('?')[0] : null
	const noteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

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

	function handleCancelBadge() {
		setHideBadgeCookie()
		setShowBadge(false)
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
						onCancel={handleCancelBadge}
					/>
				</div>
			)}
			{!noteId ? (
				<div className="flex-1 flex items-center justify-center translate-y-[30%]">
					{isInitialLoading ? (
						<IndexSkeleton />
					) : (
						<div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12">
							<div className="flex flex-col items-center gap-6 mb-8">
								<div className="flex flex-col items-center gap-3">
									<h1 className="text-4xl font-bold text-foreground font-brand">Skriuw</h1>
									<div className="flex flex-col items-center gap-1 text-muted-foreground">
										<p className="text-sm italic">
											<span className="font-mono">/skrɪu̯/</span> —{' '}
											<span className="font-medium">Frisian, &quot;to write.&quot;</span>
										</p>
									</div>
								</div>

								<div className="max-w-lg text-center">
									<p className="text-sm text-muted-foreground leading-relaxed">
										A blazingly fast, privacy-focused note-taking app built for everyone. Prooviding
										a opt-in system for all features (yes, ai is included) rather than the usual
										opt-out system. The tools are here, you just need to opt-in.
									</p>
								</div>
							</div>
							<EmptyState
								actions={[
									{
										label: 'Open Collection',
										shortcut: shortcut().modifiers('Cmd').key('O'),
										separator: true,
										onClick: handleOpenCollection,
									},
									{
										label: 'Create Note',
										shortcut: shortcut().modifiers('Cmd').key('N'),
										separator: true,
										onClick: handleCreateNote,
									},
								]}
							/>
						</div>
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
