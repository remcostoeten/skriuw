'use client'

import { BlockNoteEditor, Block } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createAIExtension } from '@blocknote/xl-ai'
import type { ChatTransport, UIMessage } from 'ai'

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
