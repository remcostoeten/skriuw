'use client'

import { BlockNoteEditor, Block } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createAIExtension } from '@blocknote/xl-ai'
import type { ChatTransport, UIMessage } from 'ai'

import { useNotesContext } from '@/features/notes/context/notes-context'

import { useEditorConfig } from './useEditorConfig'

import type { Note } from '@/features/notes'

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
			(element as any).spellcheck = true
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
							(element as any).spellcheck = true
						}
					}

					// Also check nested elements
					const nestedEditables = element.querySelectorAll('[contenteditable="true"]')
					nestedEditables.forEach((nested) => {
						nested.setAttribute('spellcheck', 'true')
						if ('spellcheck' in nested) {
							(nested as any).spellcheck = true
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
	const spellcheckObserverRef = useRef<MutationObserver | null>(null)
	const hasSpellCheck = editorConfig.editorProps?.attributes?.spellcheck === 'true'

	useEffect(() => {
		let isCancelled = false

		const loadNote = async () => {
			if (!noteId) {
				if (!isCancelled) setIsLoading(false)
				return
			}

			try {
				if (!isCancelled) {
					setIsLoading(true)
					setError(null)
				}

				const noteData = await getNote(noteId)

				if (isCancelled) return

				if (noteData) {
					setNote(noteData)
					setNoteName(noteData.name)
				} else {
					setError('Note not found')
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
				textAlignment: 'left',
			},
			content: [],
			children: [],
		} as Block,
	]

	const initialContent = useMemo(() => {
		if (note?.content && note.content.length > 0) {
			return note.content
		}
		return getDefaultContent()
	}, [note?.content])

	// Custom transport for server-side API
	const customTransport: ChatTransport<UIMessage> = {
		sendMessages: async ({ messages }) => {
			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ messages }),
			})

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const reader = response.body?.getReader()
			if (!reader) {
				throw new Error('No response body')
			}

			return new ReadableStream({
				start(controller) {
					const pump = async () => {
						try {
							while (true) {
								const { done, value } = await reader.read()
								if (done) break

								const text = new TextDecoder().decode(value)
								controller.enqueue({
									type: 'text-delta',
									textDelta: text,
								} as any)
							}
							controller.close()
						} catch (error) {
							controller.error(error)
						}
					}
					pump()
				},
			})
		},
		reconnectToStream: async () => {
			// Reconnection logic - for now return null as we don't have a reconnection mechanism
			return null
		},
	}

	// @ts-ignore // Suppress type mismatch for AIExtension
	const editor = useCreateBlockNote({
		initialContent,
		...editorConfig,
		extensions: [
			createAIExtension({
				transport: customTransport,
			}),
		],
	})

	useEffect(() => {
		if (!editor || !note || readOnly || isLoading) return

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
	}, [note, editor, readOnly, isLoading])

	// Enforce spellcheck on editor elements
	useEffect(() => {
		if (!editor) return

		// Wait for DOM to be ready, then enforce spellcheck
		const enforceSpellcheckWithDelay = () => {
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
		const handleContentChange = () => {
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
		if (!editor || !noteId) return

		try {
			const blocks = editor.document
			updateNote(noteId, blocks, noteName)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save note')
		}
	}, [editor, noteId, noteName, updateNote])

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
