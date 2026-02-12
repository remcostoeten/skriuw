'use client'

import { useEditorConfig } from './useEditorConfig'
import type { Note } from '@/features/notes'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { extractTags } from '@/features/notes/utils/extract-tags'
import { BlockNoteEditor, Block } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'

/**
 * Enforces spellcheck on all contenteditable elements within a container
 */
function enforceSpellcheck(container: Element | null): MutationObserver | null {
	if (!container) return null

	// Find all contenteditable elements
	const editableElements = container.querySelectorAll('[contenteditable="true"]')

	editableElements.forEach((element) => {
		// Force spellcheck to be enabled
		element.setAttribute('spellcheck', 'true')

		// Also force via property for browsers that respect it
		if ('spellcheck' in element) {
			;(element as any).spellcheck = true
		}
	})

	// Also observe for dynamically created elements
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType === Node.ELEMENT_NODE) {
					const element = node as Element
					if (element.hasAttribute && element.hasAttribute('contenteditable')) {
						element.setAttribute('spellcheck', 'true')
						if ('spellcheck' in element) {
							;(element as any).spellcheck = true
						}
					}

					// Also check nested elements
					const nestedEditables = element.querySelectorAll('[contenteditable="true"]')
					nestedEditables.forEach((nested) => {
						nested.setAttribute('spellcheck', 'true')
						if ('spellcheck' in nested) {
							;(nested as any).spellcheck = true
						}
					})
				}
			})
		})
	})

	observer.observe(container, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['contenteditable']
	})

	return observer
}

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
	readOnly = false
}: options): props {
	const { getNote, updateNote } = useNotesContext()
	const { config: editorConfig } = useEditorConfig()
	// Track if we've completed initial load for this noteId
	const initialLoadAttemptedRef = useRef<string | null>(null)
	const [note, setNote] = useState<Note | null>(null)
	const [noteName, setNoteName] = useState('')
	// Start with isLoading=false to avoid flash - we'll set it true only if truly needed
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const saveTimeoutRef = useRef<NodeJS.Timeout>(undefined)
	const hasInitializedRef = useRef(false)
	const spellcheckObserverRef = useRef<MutationObserver | null>(null)
	const hasSpellCheck = editorConfig.editorProps?.attributes?.spellcheck === 'true'

	useEffect(() => {
		let isCancelled = false

		const loadNote = async () => {
			if (!noteId) {
				if (!isCancelled) setIsLoading(false)
				return
			}

			// Skip if we're already on the same note
			if (note?.id === noteId) {
				setIsLoading(false)
				return
			}

			try {
				setError(null)

				// Since getNote is essentially synchronous (just a tree lookup),
				// try to get it immediately without showing loading state
				const noteData = await getNote(noteId)

				if (isCancelled) return

				if (noteData) {
					setNote(noteData)
					setNoteName(noteData.name)
					setIsLoading(false)
				} else {
					// Note not found in cache - might need to wait for data
					// Only show loading if this is a fresh load attempt
					if (initialLoadAttemptedRef.current !== noteId) {
						initialLoadAttemptedRef.current = noteId
						setIsLoading(true)
						// Give React Query a moment to potentially load the data
						await new Promise((resolve) => setTimeout(resolve, 50))
						if (!isCancelled) {
							const retryData = await getNote(noteId)
							if (retryData) {
								setNote(retryData)
								setNoteName(retryData.name)
							} else {
								setError('Note not found')
							}
						}
					} else {
						setError('Note not found')
					}
				}
			} catch (err) {
				if (!isCancelled) {
					setError(err instanceof Error ? err.message : 'Failed to load note')
				}
			} finally {
				if (!isCancelled) {
					setIsLoading(false)
				}
			}
		}

		loadNote()

		return () => {
			isCancelled = true
		}
	}, [noteId, getNote])

	const getDefaultContent = (): Block[] => [
		{
			id: '1',
			type: 'paragraph',
			props: {
				backgroundColor: 'default',
				textColor: 'default',
				textAlignment: 'left'
			},
			content: [],
			children: []
		} as Block
	]

	const initialContent = useMemo(() => {
		if (note?.content && note.content.length > 0) {
			return note.content
		}
		return getDefaultContent()
	}, [note?.content])

	const editor = useCreateBlockNote({
		initialContent,
		...editorConfig,
		editorModuleSpec: {
			// @ts-ignore
			editable: !readOnly
		},
		// Some versions of BlockNote use this
		_editable: !readOnly
	})

	// Force editable state update if it changes
	useEffect(() => {
		if (editor) {
			editor.isEditable = !readOnly
		}
	}, [editor, readOnly])

	useEffect(() => {
		if (!editor || !note || isLoading) return

		if (!hasInitializedRef.current) {
			const contentToLoad =
				note.content && note.content.length > 0 ? note.content : getDefaultContent()

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
	}, [note, editor, isLoading]) // Removed readOnly from dependency to allow loading in readOnly mode

	// ... spellcheck effect ... (keeping existing)

	// Enforce spellcheck on editor elements
	useEffect(() => {
		if (!editor) return

		// Wait for DOM to be ready, then enforce spellcheck
		function enforceSpellcheckWithDelay() {
			setTimeout(() => {
				const editorElement = document.querySelector('.bn-editor')
				if (editorElement && hasSpellCheck) {
					// Clean up previous observer if exists
					if (spellcheckObserverRef.current) {
						spellcheckObserverRef.current.disconnect()
					}

					// Enforce spellcheck and set up new observer
					spellcheckObserverRef.current = enforceSpellcheck(editorElement)
				}
			}, 100) // Small delay to ensure BlockNote has rendered
		}

		// Initial enforcement
		enforceSpellcheckWithDelay()

		// Also enforce when editor content changes
		function handleContentChange() {
			enforceSpellcheckWithDelay()
		}

		editor.onEditorContentChange(handleContentChange)

		return () => {
			// Clean up observer on unmount
			if (spellcheckObserverRef.current) {
				spellcheckObserverRef.current.disconnect()
				spellcheckObserverRef.current = null
			}
		}
	}, [editor, hasSpellCheck])

	useEffect(() => {
		hasInitializedRef.current = false
	}, [noteId])

	const handleSave = useCallback(() => {
		if (!editor || !noteId || readOnly) return // Added readOnly check

		try {
			const blocks = editor.document
			const tags = extractTags(blocks)
			updateNote(noteId, blocks, noteName, undefined, tags)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save note')
		}
	}, [editor, noteId, noteName, updateNote, readOnly])

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
		editor: editor, // BlockNoteEditor | null
		note,
		noteName,
		isLoading,
		setNoteName,
		handleSave,
		error
	}
}
