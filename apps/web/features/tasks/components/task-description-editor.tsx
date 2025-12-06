'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { PartialBlock } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { useTheme } from 'next-themes'

import { useEditorConfig } from '../../editor/hooks/useEditorConfig'
import { EditorWrapper } from '../../editor/components/editor-wrapper'

interface TaskDescriptionEditorProps {
    title: string
    initialContent: string | null
    onUpdate: (content: string) => void
    onTitleUpdate: (title: string) => void
    isReadOnly?: boolean
}

export function TaskDescriptionEditor({ title, initialContent, onUpdate, onTitleUpdate, isReadOnly = false }: TaskDescriptionEditorProps) {
    const { theme } = useTheme()
    const { config } = useEditorConfig()

    // Parse initial content safely and prepend Title block
    const parsedContent = useMemo(() => {
        let blocks: PartialBlock[] = [];

        // Handle description parsing
        if (initialContent) {
            try {
                const parsed = JSON.parse(initialContent);
                if (Array.isArray(parsed)) {
                    blocks = parsed;
                } else {
                    blocks = [{ type: 'paragraph', content: initialContent } as PartialBlock];
                }
            } catch {
                blocks = [{ type: 'paragraph', content: initialContent } as PartialBlock];
            }
        } else {
            // Default empty description block
            blocks = [{ type: 'paragraph', content: '' } as PartialBlock];
        }

        // Prepend Title as H2
        // We use a unique ID for the title block if possible, but BlockNote generates them.
        // We just ensure the first block is our title.
        return [
            {
                type: 'heading',
                props: { level: 2 },
                content: title
            } as PartialBlock,
            ...blocks
        ];
    }, [initialContent /* we intentionally exclude title to prevent full re-initialization on every keystroke */]);

    // Create the editor instance with main app config
    const editor = useCreateBlockNote({
        ...config,
        initialContent: parsedContent,
        uploadFile: async (file) => {
            return URL.createObjectURL(file)
        },
    })

    // Handle content changes
    const handleChange = useCallback(() => {
        if (editor) {
            const blocks = editor.document;

            if (blocks.length > 0) {
                // Sync Title (First Block)
                const firstBlock = blocks[0] as any;
                // Extract text content safely
                let titleText = '';
                if (Array.isArray(firstBlock.content)) {
                    titleText = (firstBlock.content as any[]).map(c => c.type === 'text' ? c.text : '').join('');
                } else if (typeof firstBlock.content === 'string') {
                    titleText = firstBlock.content;
                }

                // Avoid infinite loops if unchanged
                if (titleText !== title) {
                    onTitleUpdate(titleText);
                }

                // Sync Description (Rest of blocks)
                const descriptionBlocks = blocks.slice(1);
                // If only title exists, description is empty
                const descriptionContent = JSON.stringify(descriptionBlocks);
                onUpdate(descriptionContent);
            }
        }
    }, [editor, onUpdate, onTitleUpdate, title])

    // Attach change listener
    useEffect(() => {
        if (editor && !isReadOnly) {
            const unsubscribe = editor.onEditorContentChange(() => {
                handleChange();
            });
            return unsubscribe;
        }
    }, [editor, isReadOnly, handleChange])

    if (!editor) {
        return <div className="p-4 text-muted-foreground">Loading editor...</div>
    }

    return (
        <div className="h-full flex-1 relative">
            <EditorWrapper editor={editor} className="bg-transparent" />
        </div>
    )
}
