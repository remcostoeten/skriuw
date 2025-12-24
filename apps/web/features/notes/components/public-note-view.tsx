'use client'

import { useMemo } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@/features/editor/components/blocknote-shadcn/BlockNoteView'
import type { Block, PartialBlock } from '@blocknote/core'
import { Separator, Card } from '@skriuw/ui'

type PublicNoteViewProps = {
	name: string
	author?: string | null
	createdAt: number
	updatedAt: number
	content: string
	views: number
}

function parseContent(raw: string): PartialBlock[] {
	try {
		const parsed = JSON.parse(raw)
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed as PartialBlock[]
		}
		return [{ type: 'paragraph', content: [] }]
	} catch {
		return [{ type: 'paragraph', content: [] }]
	}
}

export function PublicNoteView(props: PublicNoteViewProps) {
	const blocks = useMemo(() => parseContent(props.content), [props.content])
	const editor = useCreateBlockNote({
		initialContent: blocks,
		editorModuleSpec: {
			editable: false,
		},
		_editable: false,
	})

	const created = new Date(props.createdAt).toLocaleString()
	const updated = new Date(props.updatedAt).toLocaleString()

	return (
		<div className="max-w-3xl mx-auto px-4 py-10">
			<Card className="p-6 space-y-3 bg-background">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold">{props.name || 'Untitled'}</h1>
					<p className="text-sm text-muted-foreground">
						{props.author ? `By ${props.author}` : 'Shared note'} · Created {created} · Updated {updated} · {props.views} visitors
					</p>
				</div>
				<Separator />
				{editor ? (
					<BlockNoteView editor={editor} editable={false} className="bg-background" />
				) : null}
			</Card>
		</div>
	)
}
