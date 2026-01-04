'use client'

import { AlertCircle } from 'lucide-react'
import { useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/auth-client'

import { useShortcut } from '../../shortcuts/use-shortcut'
import { useEditor } from '../hooks/use-editor'
import { EmptyState } from '@skriuw/ui'

import { EditorWrapper, EditorWrapperHandle } from './editor-wrapper'

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
	const { editor, note, isLoading, error } = useEditor({
		noteId,
		autoSave,
		autoSaveDelay,
		readOnly: !session,
	})

	const editorRef = useRef<EditorWrapperHandle | null>(null)
	const searchParams = useSearchParams()
	const hasFocusedRef = useRef(false)

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
		<div className={`flex-1 bg-background-secondary overflow-hidden flex flex-col touch-pan-y overscroll-none ${className}`}>
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
		</div>
	)
}
