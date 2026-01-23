'use client'

import { AlertCircle } from 'lucide-react'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { notify } from '@/lib/notify'
import { haptic } from '@skriuw/shared'

import { useShortcut } from '../../shortcuts/use-shortcut'
import { useEditor } from '../hooks/use-editor'
import { EmptyState } from '@skriuw/ui'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useUIStore } from '@/stores/ui-store'
import { getArchiveId } from '@/features/notes/utils/archive-folder'

import { EditorWrapper, EditorWrapperHandle } from './editor-wrapper'
import { CommandSurface, type SurfaceContext, type BlockKind, createBlock } from './bottom-command-surface'

type Props = {
	noteId: string
	className?: string
	autoSave?: boolean
	autoSaveDelay?: number
	showHeader?: boolean
}

export function NoteEditor({
	noteId,
	className = '',
	showHeader = true,
	autoSave = true,
	autoSaveDelay = 1000,
}: Props) {
	const { data: session } = useSession()
	const router = useRouter()
	const { editor, note, isLoading, error } = useEditor({
		noteId,
		autoSave,
		autoSaveDelay,
	})
	const { items, createNote, createFolder, moveItem, deleteItem } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)
	const { toggleMobileSidebar } = useUIStore()

	const editorRef = useRef<EditorWrapperHandle | null>(null)
	const searchParams = useSearchParams()
	const hasFocusedRef = useRef(false)
	const [surfaceOpen, setSurfaceOpen] = useState(false)
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

	useShortcut('editor-focus', (event: KeyboardEvent) => {
		const target = event.target as HTMLElement
		const isInput =
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.isContentEditable

		if (isInput) return

		event.preventDefault()
		editorRef.current?.focusEditor()
	})

	// Reset focus ref when noteId changes
	useEffect(() => {
		hasFocusedRef.current = false
	}, [noteId])

	// Focus editor when note is newly created or when navigating with ?focus=true
	useEffect(() => {
		if (editor && note && !hasFocusedRef.current) {
			const isEmptyParagraph =
				note.content.length === 1 &&
				note.content[0].type === 'paragraph' &&
				(!note.content[0].content || note.content[0].content.length === 0)

			const isEmptyHeading =
				note.content.length === 1 &&
				note.content[0].type === 'heading' &&
				(note.content[0].props?.level === 1 || note.content[0].props?.level === 2) &&
				(!note.content[0].content || note.content[0].content.length === 0)

			const isNewNote =
				!note.content || note.content.length === 0 || isEmptyParagraph || isEmptyHeading
			const shouldFocus = isNewNote || searchParams.get('focus') === 'true'

			if (shouldFocus) {
				// Reduced timeout for snappier feel, especially on mobile
				const focusTimeout = isNewNote ? 50 : 100
				setTimeout(() => {
					editorRef.current?.focusEditor()
					hasFocusedRef.current = true
				}, focusTimeout)
			}
		}
	}, [editor, note, searchParams, noteId])

	const context = useMemo<SurfaceContext>(function contextValue() {
		return {
			editor,
			noteId,
			cursor,
		}
	}, [cursor, editor, noteId])

	const handleCreate = useCallback(
		async function handleCreate() {
			try {
				const newNote = await createNote('Untitled')
				if (!newNote) {
					notify('Failed to create note').duration(3000)
					return
				}
				const url = getNoteUrl(newNote.id)
				haptic.success()
				notify('Note created').duration(2000)
				router.push(`${url}?focus=true`)
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Unknown error'
				notify(`Failed to create note: ${message}`).duration(3000)
			}
		},
		[createNote, getNoteUrl, router]
	)

	const handleInsert = useCallback(
		function handleInsert(kind: BlockKind, active: SurfaceContext) {
			if (!active.editor) return
			const position = active.editor.getTextCursorPosition()
			const block = createBlock(kind)
			const inserted = active.editor.insertBlocks([block], position.block, 'after')
			if (inserted.length > 0) {
				active.editor.setTextCursorPosition(inserted[0], 'end')
			}
		},
		[]
	)

	const handleLink = useCallback(
		function handleLink(url: string, active: SurfaceContext) {
			if (!active.editor) return
			const text = window.getSelection()?.toString() || url
			active.editor.createLink(url, text)
			active.editor.insertInlineContent(' ')
		},
		[]
	)

	const handleNotes = useCallback(
		function handleNotes() {
			router.push('/')
		},
		[router]
	)

	const handleFiles = useCallback(
		function handleFiles() {
			toggleMobileSidebar()
		},
		[toggleMobileSidebar]
	)

	const exitNote = useCallback(
		function exitNote() {
			router.push('/')
		},
		[router]
	)

	const handleArchive = useCallback(
		async function handleArchive(active: SurfaceContext) {
			try {
				const archiveId = await getArchiveId(items, createFolder)
				await moveItem(active.noteId, archiveId)
				notify('Note archived').duration(2000)
				exitNote()
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Unknown error'
				notify(`Failed to archive note: ${message}`).duration(3000)
				console.error('Failed to archive note', err)
			}
		},
		[createFolder, exitNote, items, moveItem]
	)

	const handleDelete = useCallback(
		async function handleDelete(active: SurfaceContext) {
			try {
				await deleteItem(active.noteId)
				notify('Note moved to trash').duration(2000)
				exitNote()
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Unknown error'
				notify(`Failed to delete note: ${message}`).duration(3000)
				console.error('Failed to delete note', err)
			}
		},
		[deleteItem, exitNote]
	)

	const handleSurfaceChange = useCallback(function handleSurfaceChange(open: boolean) {
		setSurfaceOpen(open)
	}, [])

	const updateCursor = useCallback(function updateCursor() {
		const selection = window.getSelection()
		if (!selection || selection.rangeCount === 0) {
			setCursor(null)
			return
		}
		const range = selection.getRangeAt(0)
		const rect = range.getBoundingClientRect()
		if (!rect) {
			setCursor(null)
			return
		}
		setCursor({ x: rect.left, y: rect.top })
	}, [])

	useEffect(function watchSelection() {
		if (!surfaceOpen) return undefined
		updateCursor()
		document.addEventListener('selectionchange', updateCursor)
		return function cleanup() {
			document.removeEventListener('selectionchange', updateCursor)
		}
	}, [surfaceOpen, updateCursor])

	if (error) {
		return (
			<EmptyState
				message="Failed to load note"
				submessage={error}
				icon={<AlertCircle className="h-8 w-8 text-destructive" />}
				actions={[
					{
						label: 'Refresh page',
						onClick: () => window.location.reload(),
					},
				]}
				isFull
			/>
		)
	}

	// Show loading skeleton while fetching note data
	if (isLoading || !note) {
		return (
			<div className={`flex-1 bg-background-secondary overflow-hidden flex flex-col touch-pan-y overscroll-none ${className}`}>
				<div className="flex-1 p-8 animate-pulse">
					<div className="h-8 w-48 bg-muted/50 rounded mb-6" />
					<div className="space-y-3">
						<div className="h-4 w-full bg-muted/30 rounded" />
						<div className="h-4 w-5/6 bg-muted/30 rounded" />
						<div className="h-4 w-4/6 bg-muted/30 rounded" />
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className={`flex-1 bg-background-secondary overflow-y-auto flex flex-col touch-pan-y overscroll-none ${className}`}>
			<div className="flex-1">
				{isLoading ? (
					<EmptyState
						message="Loading editor..."
						submessage="Please wait while we prepare your editor"
					/>
				) : editor ? (
					<EditorWrapper ref={editorRef} editor={editor} />
				) : (
					<EmptyState
						message="No editor available"
						submessage="Unable to initialize the editor"
						isFull
					/>
				)}
			</div>
			<CommandSurface
				open={surfaceOpen}
				onOpenChange={handleSurfaceChange}
				context={context}
				onCreate={handleCreate}
				onInsert={handleInsert}
				onLink={handleLink}
				onNotes={handleNotes}
				onFiles={handleFiles}
				onArchive={handleArchive}
				onDelete={handleDelete}
			/>
		</div>
	)
}

function getArchive(
	items: Item[],
	createFolder: (name?: string) => Promise<Folder>
) {
	const archive = findFolder(items, 'archive')
	if (archive) {
		return Promise.resolve(archive.id)
	}
	return createFolder('Archive').then(function handleFolder(folder) {
		return folder.id
	})
}

function findFolder(items: Item[], name: string): Folder | null {
	for (const item of items) {
		if (item.type === 'folder' && item.name.toLowerCase() === name.toLowerCase()) {
			return item
		}
		if (item.type === 'folder' && item.children) {
			const found = findFolder(item.children, name)
			if (found) return found
		}
	}
	return null
}
