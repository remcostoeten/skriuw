'use client'

import { useState } from 'react'
import { Copy, FileCode, RefreshCw } from 'lucide-react'
import { useNotesContext } from '@/features/notes'
import { notify } from '@/lib/notify'
import { cn } from '@skriuw/shared'
import type { Block } from '@blocknote/core'
import type { Item, Note, Folder } from '@/features/notes/types'

export function SeedingTab() {
    const { items, refreshItems } = useNotesContext()
    const [generatedCode, setGeneratedCode] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)

    const generateCode = async () => {
        setIsGenerating(true)
        try {
            // Flatten tree to get folders and notes
            const folders: any[] = []
            const notes: any[] = []

            const traverse = (itemList: Item[], folderName?: string) => {
                for (const item of itemList) {
                    if (item.type === 'folder') {
                        const folder = item as Folder
                        folders.push({
                            name: folder.name,
                            pinned: folder.pinned,
                            // We only track 1 level of folder nesting for seeds usually, 
                            // but let's support flattening.
                            // preseed-data.ts structure is flat list of folders + notes with folder refs.
                        })
                        traverse(folder.children, folder.name)
                    } else {
                        const note = item as Note
                        notes.push({
                            name: note.name,
                            content: note.content,
                            pinned: note.pinned,
                            favorite: note.favorite,
                            folder: folderName // The parent folder name
                        })
                    }
                }
            }

            traverse(items)

            const code = generateTypeScript(folders, notes)
            setGeneratedCode(code)
            notify('Seed code generated!')
        } catch (e) {
            console.error('Failed to generate seed code', e)
            notify('Failed to generate code')
        } finally {
            setIsGenerating(false)
        }
    }

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedCode)
        notify('Copied to clipboard')
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Seed Data Generator</h3>
                <div className="flex gap-2">
                    <button
                        onClick={refreshItems}
                        className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        title="Refresh Data"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="text-xs text-muted-foreground">
                Target: <code>apps/web/lib/preseed-data.ts</code>
            </div>

            <button
                onClick={generateCode}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
                {isGenerating ? 'Generating...' : 'Generate TypeScript Code'}
            </button>

            {generatedCode && (
                <div className="relative border rounded-md bg-muted/30">
                    <div className="absolute top-2 right-2 flex gap-1">
                        <button
                            onClick={copyToClipboard}
                            className="p-1.5 bg-background border rounded text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy to clipboard"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <pre className="p-3 text-[10px] font-mono overflow-auto max-h-[300px] custom-scrollbar">
                        {generatedCode}
                    </pre>
                </div>
            )}
        </div>
    )
}

function generateTypeScript(folders: any[], notes: any[]): string {
    const today = new Date().toISOString().split('T')[0]

    return `// Generated Seed Data - ${today}

const FOLDERS = [
${folders.map(f => `    { name: '${escape(f.name)}'${f.pinned ? ', pinned: true' : ''} },`).join('\n')}
]

const NOTES: NoteDefinition[] = [
${notes.map(n => {
        const content = formatContent(n.content)
        const props = [
            `name: '${escape(n.name)}'`,
            `content: ${content}`,
            n.pinned ? 'pinned: true' : null,
            n.favorite ? 'favorite: true' : null,
            n.folder ? `folder: '${escape(n.folder)}'` : null
        ].filter(Boolean).join(', ')

        return `    { ${props} },`
    }).join('\n')}
]
`
}

function escape(str: string) {
    return str.replace(/'/g, "\\'")
}

function formatContent(content: any): string {
    if (!Array.isArray(content)) return '[]'

    // Try to use helpers if possible
    try {
        const blocks = content.map(block => {
            if (block.type === 'heading') {
                const text = block.content?.[0]?.text || ''
                const level = block.props?.level || 1
                return `heading(${level}, '${escape(text)}')`
            }
            if (block.type === 'paragraph') {
                const text = block.content?.[0]?.text || ''
                // Handle simple text, ignore styles for simplicity in seed export for now
                // or JSON.stringify if complex
                if (text && block.content.length === 1 && Object.keys(block.content[0].styles || {}).length === 0) {
                    return `paragraph('${escape(text)}')`
                }
                if (!text) return `paragraph('')`
            }
            if (block.type === 'bulletListItem') {
                const text = block.content?.[0]?.text || ''
                if (text && block.content.length === 1) return `bulletItem('${escape(text)}')`
            }
            if (block.type === 'numberedListItem') {
                const text = block.content?.[0]?.text || ''
                if (text && block.content.length === 1) return `numberedItem('${escape(text)}')`
            }

            // Fallback to raw object but formatted nicely could be huge.
            // Let's print raw object but clean IDs?
            // "createId" in preseed-data handles IDs. So we can omit IDs here if we assume helpers.
            // But for raw generic blocks, we might need full structure.
            // For now, let's just JSON.stringify non-helpers.
            return JSON.stringify(block)
        })

        // Check if all are helpers (strings ending in ')')
        // If strict JSON is mixed with function calls, we need to construct array string manually
        return `[\n${blocks.map((b: string) => `        ${b}`).join(',\n')}\n    ]`
    } catch (e) {
        return '[]'
    }
}
