'use client'

import { useEditorConfig } from './useEditorConfig'
import type { Note } from '@/features/notes'
import { useNoteQuery } from '@/features/notes/hooks/use-notes-query'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { extractTags } from '@/features/notes/utils/extract-tags'
import { useSettings } from '@/features/settings'
import { extractTasksFromBlocks } from '@/features/notes/utils/extract-tasks'
import { useSyncTasksMutation } from '@/features/tasks/hooks/use-tasks-query'
import { BlockNoteEditor, Block } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'

/**
 * Enforces spellcheck on all contenteditable elements within a container
 */
function enforceSpellcheck(container: Element | null): MutationObserver | null {
	if (!container) return null

	const editableElements = container.querySelectorAll('[contenteditable="true"]')
	editableElements.forEach((element) => {
		element.setAttribute('spellcheck', 'true')
		if ('spellcheck' in element) {
			; (element as any).spellcheck = true
		}
	})

	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType === Node.ELEMENT_NODE) {
					const element = node as Element
					if (element.hasAttribute && element.hasAttribute('contenteditable')) {
						element.setAttribute('spellcheck', 'true')
						if ('spellcheck' in element) {
							; (element as any).spellcheck = true
						}
					}
					const nestedEditables = element.querySelectorAll('[contenteditable="true"]')
					nestedEditables.forEach((nested) => {
						nested.setAttribute('spellcheck', 'true')
						if ('spellcheck' in nested) {
							; (nested as any).spellcheck = true
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
	immediatelySave: () => void
	error: string | null
}

function getDefaultContent(): Block[] {
	return [
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
}

export function useEditor({
	noteId,
	autoSave = true,
	autoSaveDelay = 1000,
	readOnly = false
}: options): props {
	// --- SINGLE SOURCE OF TRUTH: TanStack Query ---
	// No local useState<Note> — note data comes directly from the cache.
	// The component is keyed by noteId externally, so this hook always mounts
	// fresh for each note. useNoteQuery returns cached data synchronously when
	// the note has been seen before, meaning isLoading is false immediately.
	const {
		data: noteData,
		isLoading: isQueryLoading,
		error: queryError
	} = useNoteQuery(noteId)

	const note = (noteData as Note | null | undefined) ?? null
	const isLoading = isQueryLoading
	const error = queryError
		? queryError instanceof Error
			? queryError.message
			: 'Failed to load note'
		: null

	const { updateNote } = useNotesContext()
	const { config: editorConfig } = useEditorConfig()
	const { getSetting } = useSettings()

	// noteName is local UI state — it tracks what's shown in the title input.
	// We reset it when the note id changes (handled by key= on the parent component)
	// and sync it when the note data first loads.
	const [noteName, setNoteName] = useState(note?.name ?? '')

	// Sync noteName from query data when it first resolves (cold cache case)
	useEffect(() => {
		if (note?.name) {
			setNoteName(note.name)
		}
	}, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps
	// Intentionally only depend on note?.id — we don't want to overwrite
	// in-progress title edits every time the query refreshes.

	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const spellcheckObserverRef = useRef<MutationObserver | null>(null)

	const hasSpellCheck = editorConfig.editorProps?.attributes?.spellcheck === 'true'
	const titleInEditor = getSetting('titleInEditor') ?? false
	const titlePlaceholder = getSetting('titlePlaceholder') ?? 'Untitled'

	const getTitleFromBlocks = useCallback(
		(blocks: Block[]): string => {
			const getInlineText = (content: any): string => {
				if (!content) return ''
				if (typeof content === 'string') return content
				if (Array.isArray(content)) {
					return content
						.map((item) => {
							if (typeof item === 'string') return item
							if (item && typeof item.text === 'string') return item.text
							return ''
						})
						.join('')
				}
				return ''
			}

			for (const block of blocks) {
				const text = getInlineText((block as any).content).trim()
				if (text) return text
			}
			return titlePlaceholder
		},
		[titlePlaceholder]
	)

	// initialContent is computed once per note (keyed by note?.id).
	// Because the component is remounted via key={noteId} in the parent,
	// useCreateBlockNote always receives the correct content for the current note.
	// We do NOT re-derive this on every content change — the editor owns its
	// content after mount. Depending on note?.id (not note?.content) prevents
	// stale memo from causing replaceBlocks hacks.
	function isValidBlockArray(blocks: unknown): blocks is Block[] {
		if (!Array.isArray(blocks) || blocks.length === 0) return false
		return blocks.every(
			(b) => b && typeof b === 'object' && typeof (b as any).type === 'string'
		)
	}

	const initialContent = useMemo(() => {
		if (note?.content && isValidBlockArray(note.content)) {
			return note.content
		}
		return getDefaultContent()
	}, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

	const editor = useCreateBlockNote({
		initialContent,
		...editorConfig,
	})

	// Keep editable state in sync if readOnly prop changes after mount
	useEffect(() => {
		if (editor) {
			editor.isEditable = !readOnly
		}
	}, [editor, readOnly])

	// Spellcheck enforcement
	useEffect(() => {
		if (!editor) return

		function enforceSpellcheckWithDelay() {
			setTimeout(() => {
				const editorElement = document.querySelector('.bn-editor')
				if (editorElement && hasSpellCheck) {
					if (spellcheckObserverRef.current) {
						spellcheckObserverRef.current.disconnect()
					}
					spellcheckObserverRef.current = enforceSpellcheck(editorElement)
				}
			}, 100)
		}

		enforceSpellcheckWithDelay()

		function handleContentChange() {
			enforceSpellcheckWithDelay()
		}

		editor.onEditorContentChange(handleContentChange)

		return () => {
			if (spellcheckObserverRef.current) {
				spellcheckObserverRef.current.disconnect()
				spellcheckObserverRef.current = null
			}
		}
	}, [editor, hasSpellCheck])

	const syncTasks = useSyncTasksMutation()

	const handleSave = useCallback(() => {
		if (!editor || !noteId || readOnly) return

		try {
			const blocks = editor.document
			const tags = extractTags(blocks)
			const tasks = extractTasksFromBlocks(blocks, noteId)
			syncTasks.mutate({ noteId, tasks })

			const derivedTitle = titleInEditor ? getTitleFromBlocks(blocks) : noteName
			updateNote(noteId, blocks, derivedTitle, undefined, tags)
		} catch (err) {
			// handleSave errors are non-fatal — log only, don't surface to user
			// unless we add a save-error indicator in the future
			console.error('[useEditor] handleSave error:', err)
		}
	}, [editor, noteId, noteName, updateNote, readOnly, titleInEditor, getTitleFromBlocks, syncTasks])

	// Immediate save — cancels any pending debounced save and fires synchronously.
	// Used by task blocks that need content persisted before opening the task panel.
	const immediatelySave = useCallback(() => {
		if (!editor || !noteId || readOnly) return
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current)
			saveTimeoutRef.current = undefined
		}
		handleSave()
	}, [editor, noteId, readOnly, handleSave])

	// Auto-save: debounced on every content change.
	// Cleanup cancels the pending timeout on unmount or noteId change,
	// preventing saves from firing after the component has been replaced.
	useEffect(() => {
		if (!editor || !noteId || isLoading || !autoSave || readOnly) return

		function handleChange() {
			if (titleInEditor) {
				const derivedTitle = getTitleFromBlocks(editor.document)
				if (derivedTitle !== noteName) {
					setNoteName(derivedTitle)
				}
			}
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current)
			}
			saveTimeoutRef.current = setTimeout(() => {
				handleSave()
			}, autoSaveDelay)
		}

		editor.onEditorContentChange(handleChange)

		return () => {
			// CRITICAL: cancel pending debounced save on unmount or re-run.
			// The save closure captures the correct noteId so even if it fired
			// late it would save to the right note — but cancelling is cleaner
			// and avoids any "update on unmounted component" warnings.
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current)
				saveTimeoutRef.current = undefined
			}
		}
	}, [
		editor,
		noteId,
		noteName,
		isLoading,
		autoSave,
		autoSaveDelay,
		readOnly,
		handleSave,
		titleInEditor,
		getTitleFromBlocks
	])

	return {
		editor,
		note,
		noteName,
		isLoading,
		setNoteName,
		handleSave,
		immediatelySave,
		error
	}
}
