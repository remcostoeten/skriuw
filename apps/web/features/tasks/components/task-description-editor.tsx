'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { PartialBlock, Block } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useTheme } from 'next-themes'

import { useEditorConfig } from '../../editor/hooks/useEditorConfig'
import { EditorWrapper } from '../../editor/components/editor-wrapper'
import { useTaskContext } from '../hooks/use-task-context'
import { extractTasksFromBlocks } from '../../notes/utils/extract-tasks'
import { syncTasksToDatabase } from '../api/mutations/sync-tasks'

interface TaskDescriptionEditorProps {
    title: string
    initialContent: string | null
    onUpdate: (content: string) => void
    onTitleUpdate: (title: string) => void
    isReadOnly?: boolean
}

export function TaskDescriptionEditor({
    title,
    initialContent,
    onUpdate,
    onTitleUpdate,
    isReadOnly = false,
}: TaskDescriptionEditorProps) {
    const { theme } = useTheme()
    const { config } = useEditorConfig()
    const taskContext = useTaskContext()
    const syncTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

    const parsedContent = useMemo(() => {
        let blocks: PartialBlock[] = []

        if (initialContent) {
            try {
                const parsed = JSON.parse(initialContent)
                if (Array.isArray(parsed)) {
                    blocks = parsed
                } else {
                    blocks = [{ type: 'paragraph', content: initialContent } as PartialBlock]
                }
            } catch {
                blocks = [{ type: 'paragraph', content: initialContent } as PartialBlock]
            }
        } else {
            blocks = [{ type: 'paragraph', content: '' } as PartialBlock]
        }

        return [
            {
                type: 'heading',
                props: { level: 2 },
                content: title,
            } as PartialBlock,
            ...blocks,
        ]
    }, [initialContent])

    const editor = useCreateBlockNote({
        ...config,
        initialContent: parsedContent,
        uploadFile: async (file) => {
            return URL.createObjectURL(file)
        },
    })

    const syncDescriptionTasks = useCallback(
        async (blocks: Block[]) => {
            if (!taskContext?.noteId || !taskContext?.parentTaskId) return

            const tasks = extractTasksFromBlocks(
                blocks,
                taskContext.noteId,
                taskContext.parentTaskId,
                0
            )

            if (tasks.length > 0) {
                try {
                    await syncTasksToDatabase(taskContext.noteId, tasks)
                } catch (err) {
                    console.error('Failed to sync description tasks:', err)
                }
            }
        },
        [taskContext?.noteId, taskContext?.parentTaskId]
    )

    const handleChange = useCallback(() => {
        if (!editor) return

        const blocks = editor.document

        if (blocks.length > 0) {
            const firstBlock = blocks[0] as any
            let titleText = ''
            if (Array.isArray(firstBlock.content)) {
                titleText = (firstBlock.content as any[])
                    .map((c) => (c.type === 'text' ? c.text : ''))
                    .join('')
            } else if (typeof firstBlock.content === 'string') {
                titleText = firstBlock.content
            }

            if (titleText !== title) {
                onTitleUpdate(titleText)
            }

            const descriptionBlocks = blocks.slice(1)
            const descriptionContent = JSON.stringify(descriptionBlocks)
            onUpdate(descriptionContent)

            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
            }
            syncTimeoutRef.current = setTimeout(() => {
                syncDescriptionTasks(descriptionBlocks as Block[])
            }, 1000)
        }
    }, [editor, onUpdate, onTitleUpdate, title, syncDescriptionTasks])

    useEffect(() => {
        if (editor && !isReadOnly) {
            const unsubscribe = editor.onEditorContentChange(() => {
                handleChange()
            })
            return unsubscribe
        }
    }, [editor, isReadOnly, handleChange])

    useEffect(() => {
        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
            }
        }
    }, [])

    if (!editor) {
        return <div className="p-4 text-muted-foreground">Loading editor...</div>
    }

    return (
        <div className="h-full flex-1 relative overflow-y-auto">
            <EditorWrapper editor={editor} className="bg-transparent" />
        </div>
    )
}
