'use client'

import { useShortcut } from "../../shortcuts/use-shortcut";
import { useEditor } from "../hooks/use-editor";
import { CommandSurface, type SurfaceContext, type BlockKind, createBlock } from "./bottom-command-surface";
import { EditorWrapper, EditorWrapperHandle } from "./editor-wrapper";
import { MobileFormattingBar } from "./mobile-formatting-bar";
import { EditorHeader } from "./editor-header";
import { BacklinksPanel } from "./backlinks-panel";
import { useNotesContext } from "@/features/notes/context/notes-context";
import { useNoteSlug } from "@/features/notes/hooks/use-note-slug";
import type { Folder, Item } from "@/features/notes/types";
import { getArchiveId } from "@/features/notes/utils/archive-folder";
import { useSession } from "@/lib/auth-client";
import { notify } from "@/lib/notify";
import { useUIStore } from "@/stores/ui-store";
import { useSettings } from "@/features/settings";
import { useUpload } from "@/features/uploads";
import { haptic } from "@skriuw/shared";
import { EmptyState } from "@skriuw/ui";
import { AlertCircle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRef, useEffect, useMemo, useState, useCallback } from "react";

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
	autoSaveDelay = 1000
}: Props) {
	const { data: session } = useSession()
	const router = useRouter()
	const { editor, note, isLoading, error, noteName, setNoteName } = useEditor({
		noteId,
		autoSave,
		autoSaveDelay
	})
	const { items, createNote, createFolder, moveItem, deleteItem, updateNote } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)
	const { toggleMobileSidebar } = useUIStore()
	const { settings } = useSettings()

	const editorRef = useRef<EditorWrapperHandle | null>(null)
	const searchParams = useSearchParams()
	const hasFocusedRef = useRef(false)
	const [surfaceOpen, setSurfaceOpen] = useState(false)
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
	const [icon, setIcon] = useState<string | undefined>(note?.icon || undefined)
	const [coverImage, setCoverImage] = useState<string | undefined>(note?.coverImage || undefined)
	const [tags, setTags] = useState<string[]>(note?.tags || [])

	useEffect(() => {
		if (note) {
			// Only update if different to avoid potential loops/redundant renders,
			// though React handles same-value updates well.
			if (note.icon !== icon) setIcon(note.icon || undefined)
			if (note.coverImage !== coverImage) setCoverImage(note.coverImage || undefined)
			// tags comparison is harder, relying on ref/effect might be fine or just strict set
			if (JSON.stringify(note.tags) !== JSON.stringify(tags)) setTags(note.tags || [])
		}
	}, [note])

	const handleIconChange = useCallback((newIcon?: string) => {
		setIcon(newIcon)
		if (editor && note) {
			updateNote(note.id, editor.document, undefined, newIcon)
		}
	}, [editor, note, updateNote])

	const handleCoverImageChange = useCallback((newCover?: string) => {
		setCoverImage(newCover)
		if (note) {
			updateNote(note.id, undefined, undefined, undefined, undefined, newCover)
		}
	}, [note, updateNote])

	const { upload: uploadCover, isUploading: isUploadingCover } = useUpload({
		onSuccess: (result) => {
			handleCoverImageChange(result.url)
		},
		onError: (err) => {
			notify(`Upload failed: ${err.message}`).duration(3000)
		}
	})

	const handleCoverUpload = useCallback((file: File) => {
		const isGuest = !session?.user
		uploadCover(file, isGuest)
	}, [uploadCover, session?.user])

	const handleTagsChange = useCallback((newTags: string[]) => {
		setTags(newTags)
		if (editor && note) {
			updateNote(note.id, editor.document, undefined, undefined, newTags)
		}
	}, [editor, note, updateNote])

	const handleTitleChange = useCallback((newTitle: string) => {
		setNoteName(newTitle)
		if (editor && note) {
			const timeoutId = setTimeout(() => {
				updateNote(note.id, editor.document, newTitle)
			}, 500)
			return () => clearTimeout(timeoutId)
		}
	}, [editor, note, updateNote, setNoteName])

	useShortcut('editor-focus', (event: KeyboardEvent) => {
		const target = event.target as HTMLElement
		const isInput =
			target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

		if (isInput) return

		event.preventDefault()
		editorRef.current?.focusEditor()
	})

	useEffect(() => {
		hasFocusedRef.current = false
	}, [noteId])

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
				// Use requestAnimationFrame for near-instant focus, avoiding layout thrash
				requestAnimationFrame(() => {
					editorRef.current?.focusEditor()
					hasFocusedRef.current = true
				})
			}
		}
	}, [editor, note, searchParams, noteId])

	const context = useMemo<SurfaceContext>(
		function contextValue() {
			return {
				editor,
				noteId,
				cursor
			}
		},
		[cursor, editor, noteId]
	)

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

	const handleInsert = useCallback(function handleInsert(
		kind: BlockKind,
		active: SurfaceContext
	) {
		if (!active.editor) return
		const position = active.editor.getTextCursorPosition()
		const block = createBlock(kind)
		const inserted = active.editor.insertBlocks([block], position.block, 'after')
		if (inserted.length > 0) {
			active.editor.setTextCursorPosition(inserted[0], 'end')
		}
	}, [])

	const handleLink = useCallback(function handleLink(url: string, active: SurfaceContext) {
		if (!active.editor) return
		const text = window.getSelection()?.toString() || url
		active.editor.createLink(url, text)
		active.editor.insertInlineContent(' ')
	}, [])

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

	useEffect(
		function watchSelection() {
			if (!surfaceOpen) return undefined
			updateCursor()
			document.addEventListener('selectionchange', updateCursor)
			return function cleanup() {
				document.removeEventListener('selectionchange', updateCursor)
			}
		},
		[surfaceOpen, updateCursor]
	)

	if (error) {
		return (
			<EmptyState
				message='Failed to load note'
				submessage={error}
				icon={<AlertCircle className='h-8 w-8 text-destructive' />}
				actions={[
					{
						label: 'Refresh page',
						onClick: () => window.location.reload()
					}
				]}
				isFull
			/>
		)
	}

	if (isLoading || !note) {
		return (
			<div
				className={`flex-1 bg-background-secondary overflow-hidden flex flex-col touch-pan-y overscroll-none ${className}`}
			>
				<div className='flex-1 p-8 animate-pulse'>
					<div className='h-8 w-48 bg-muted/50 rounded mb-6' />
					<div className='space-y-3'>
						<div className='h-4 w-full bg-muted/30 rounded' />
						<div className='h-4 w-5/6 bg-muted/30 rounded' />
						<div className='h-4 w-4/6 bg-muted/30 rounded' />
					</div>
				</div>
			</div>
		)
	}

	return (
		<div
			className={`flex-1 bg-background-secondary overflow-y-auto flex flex-col touch-pan-y overscroll-none ${className}`}
		>
			<div className='flex-1'>
				{isLoading ? (
					<EmptyState
						message='Loading editor...'
						submessage='Please wait while we prepare your editor'
					/>
				) : editor ? (
					<EditorWrapper
						ref={editorRef}
						editor={editor}
						header={
							<EditorHeader
								title={noteName}
								setTitle={handleTitleChange}
								icon={icon}
								setIcon={handleIconChange}
								createdAt={note?.createdAt}
								updatedAt={note?.updatedAt}
								tags={tags}
								setTags={handleTagsChange}
								className="editor-header"
								showMetadata={settings.showEditorMetadata ?? true}
								coverImage={coverImage}
								setCoverImage={handleCoverImageChange}
								onCoverUpload={handleCoverUpload}
								enableCoverImages={settings.enableCoverImages ?? true}
							/>
						}
						footer={
							<BacklinksPanel
								noteId={noteId}
								noteName={noteName}
								className="max-w-[655px] mx-auto border-t border-border/30"
							/>
						}
					/>
				) : (
					<EmptyState
						message='No editor available'
						submessage='Unable to initialize the editor'
						isFull
					/>
				)}
			</div>
			<MobileFormattingBar editor={editor} />
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

function getArchive(items: Item[], createFolder: (name?: string) => Promise<Folder>) {
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
