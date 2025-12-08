import { BlockNoteEditor, Block } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'

import { useNotesContext } from '../../notes/context/notes-context'

import { useEditorConfig } from './useEditorConfig'

import type { Note } from '../../notes'

type options = {
	noteId: string
	autoSave?: boolean
	autoSaveDelay?: number
	readOnly?: boolean
}

type props = {
	editor: BlockNoteEditor | null
	note: Note | null
	noteName: string
	isLoading: boolean
	setNoteName: (name: string) => void
	handleSave: () => void
	error: string | null
}

export function useEditor({
	noteId,
	autoSave = true,
	autoSaveDelay = 1000,
	readOnly = false,
}: options): props {
	const { getNote, updateNote } = useNotesContext()
	const { config: editorConfig } = useEditorConfig()
	const [note, setNote] = useState<Note | null>(null)
	const [noteName, setNoteName] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const saveTimeoutRef = useRef<NodeJS.Timeout>(undefined)
	const hasInitializedRef = useRef(false)

	// Load note data
	useEffect(() => {
		const loadNote = async () => {
			if (!noteId) {
				setIsLoading(false)
				return
			}

			try {
				setIsLoading(true)
				setError(null)
				const noteData = await getNote(noteId)

				if (noteData) {
					setNote(noteData)
					setNoteName(noteData.name)
				} else {
					setError('Note not found')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load note')
			} finally {
				setIsLoading(false)
			}
		}

		loadNote()
	}, [noteId, getNote])

	const getDefaultContent = (): Block[] => [
		{
			id: '1',
			type: 'paragraph',
			props: {
				backgroundColor: 'default',
				textColor: 'default',
				textAlignment: 'left',
			},
			content: [],
			children: [],
		} as Block,
	]

	// Memoize initial content based on note to avoid stale closures
	// Only depend on note?.content since note.id is already handled by noteId dependency
	const initialContent = useMemo(() => {
		if (note?.content && note.content.length > 0) {
			return note.content
		}
		return getDefaultContent()
	}, [note?.content])

	// Create editor instance using the official React hook
	// The editor will be recreated when noteId changes (via key in parent component)
	// We use initialContent from memoized value to ensure correct content on first render
	const editor = useCreateBlockNote({
		initialContent,
		...editorConfig,
	})

	// Update editor content when note loads or changes
	// This handles the case where note loads after editor is created
	useEffect(() => {
		if (!editor || !note || readOnly || isLoading) return

		// Only update if this is a new note (noteId changed)
		// We use a ref to track if we've initialized to avoid overwriting user edits
		if (!hasInitializedRef.current) {
			const contentToLoad =
				note.content && note.content.length > 0 ? note.content : getDefaultContent()

			// Only replace if content is actually different
			const currentContent = editor.document
			const contentMatches = JSON.stringify(currentContent) === JSON.stringify(contentToLoad)

			if (!contentMatches) {
				// Defer replaceBlocks to avoid flushSync during React render
				queueMicrotask(() => {
					editor.replaceBlocks(editor.document, contentToLoad)
				})
			}
			hasInitializedRef.current = true
		}
	}, [note, editor, readOnly, isLoading])

	// Reset initialization flag when noteId changes
	useEffect(() => {
		hasInitializedRef.current = false
	}, [noteId])

	const handleSave = useCallback(() => {
		if (!editor || !noteId) return

		try {
			const blocks = editor.document
			updateNote(noteId, blocks, noteName)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save note')
		}
	}, [editor, noteId, noteName, updateNote])

	// Auto-save logic
	useEffect(() => {
		if (!editor || !noteId || isLoading || !autoSave || readOnly) return

		function handleChange() {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current)
			}
			saveTimeoutRef.current = setTimeout(() => {
				handleSave()
			}, autoSaveDelay)
		}

		editor.onEditorContentChange(handleChange)

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current)
			}
		}
	}, [editor, noteId, noteName, isLoading, autoSave, autoSaveDelay, readOnly, handleSave])

	return {
		editor: readOnly ? null : editor,
		note,
		noteName,
		isLoading,
		setNoteName,
		handleSave,
		error,
	}
}
