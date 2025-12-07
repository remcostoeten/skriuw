import { BlockNoteEditor, Block } from '@blocknote/core'
import { AlertCircle } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { EDITOR_LAYOUT } from '../styles/editor-tokens'

import { useEditor } from '../hooks/use-editor'
import { createEditorSchema } from '../hooks/useEditorConfig'

import { EditorWrapper } from './editor-wrapper'

type ViewerStyling = 'minimal' | 'document' | 'presentation'

type Props = {
	noteId: string
	className?: string
	styling?: ViewerStyling
	maxWidth?: string
}

const STYLING_CLASS_MAP: Record<ViewerStyling, string> = {
	minimal: 'viewer-minimal',
	document: 'viewer-document',
	presentation: 'viewer-presentation',
}

export function NoteViewer({
	noteId,
	className = '',
	styling = 'document',
	maxWidth = EDITOR_LAYOUT.viewerMaxWidth,
}: Props) {
	const { note, noteName, isLoading, error } = useEditor({
		noteId,
		readOnly: true,
		autoSave: false,
	})

	const defaultContent: Block[] = [
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

	const viewer = note
		? BlockNoteEditor.create({
			schema: createEditorSchema(),
			initialContent:
				note.content && note.content.length > 0 ? note.content : (defaultContent as Block[]),
			editable: false,
		})
		: null

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

	if (!note) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<EmptyState
					message="Note not found"
					submessage="The note you're looking for doesn't exist or may have been deleted"
					isFull
				/>
			</div>
		)
	}

	const stylingClass = STYLING_CLASS_MAP[styling]

	return (
		<div className={`flex-1 bg-background overflow-y-auto ${className}`}>
			<div style={{ maxWidth }} className="mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-10">
				<div className="flex flex-col gap-1">
					<div className="px-4 sm:px-8 py-2.5 flex justify-center">
						<h1 className="text-3xl sm:text-4xl text-foreground font-normal leading-tight sm:leading-10">
							{noteName ?? 'Untitled Note'}
						</h1>
					</div>

					<div
						className="mx-auto w-full"
						style={{
							maxWidth: EDITOR_LAYOUT.viewerContentMaxWidth,
							['--viewer-max-width' as string]: maxWidth,
						}}
					>
						{isLoading ? (
							<div className="flex-1 flex items-center justify-center py-20">
								<EmptyState
									message="Loading note..."
									submessage="Please wait while we load the content"
								/>
							</div>
						) : viewer ? (
							<div className={stylingClass}>
								<EditorWrapper editor={viewer as any} />
							</div>
						) : (
							<div className="flex-1 flex items-center justify-center py-20">
								<EmptyState
									message="No content available"
									submessage="This note appears to be empty"
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
