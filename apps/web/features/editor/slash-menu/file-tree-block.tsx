import { createReactBlockSpec } from '@blocknote/react'
import { generateId } from '@skriuw/core-logic'
import { FolderTree, Trash2, Edit2, Check, X, ChevronRight, ChevronDown, Folder, File, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type TNode = {
    id: string
    name: string
    type: 'file' | 'folder'
    children?: TNode[]
    isExpanded?: boolean
}

type TEditingState = {
    id: string | null
    value: string
}

type TStyle = 'card' | 'minimal'

function parseTreeString(content: string): TNode[] {
    const lines = content.split('\n').filter(line => line.trim())
    const root: TNode[] = []
    const stack: { node: TNode[], depth: number }[] = [{ node: root, depth: -1 }]

    lines.forEach(line => {
        const match = line.match(/^([│├└\s]*)([─\s]*)(.+)$/)
        if (!match) return

        const indent = match[1] + match[2]
        const name = match[3].trim()
        const depth = Math.floor(indent.replace(/[^│]/g, '').length)

        const isFolder = name.endsWith('/') || line.includes('├──') || line.includes('└──')
        const cleanName = name.replace(/\/$/, '')

        const newNode: TNode = {
            id: generateId(),
            name: cleanName,
            type: isFolder ? 'folder' : 'file',
            children: isFolder ? [] : undefined,
            isExpanded: true
        }

        while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
            stack.pop()
        }

        const parent = stack[stack.length - 1]
        parent.node.push(newNode)

        if (isFolder) {
            stack.push({ node: newNode.children!, depth })
        }
    })

    return root
}

function serializeTree(nodes: TNode[], depth: number = 0, isLast: boolean[] = []): string {
    let result = ''

    nodes.forEach((node, index) => {
        const isLastNode = index === nodes.length - 1
        const prefix = isLast.map((last, i) =>
            i === isLast.length - 1 ? '' : (last ? '    ' : '│   ')
        ).join('')

        const connector = depth === 0 ? '' : (isLastNode ? '└── ' : '├── ')
        const suffix = node.type === 'folder' ? '/' : ''

        result += prefix + connector + node.name + suffix + '\n'

        if (node.children) {
            result += serializeTree(node.children, depth + 1, [...isLast, isLastNode])
        }
    })

    return result
}

function TreeNode({
    node,
    onUpdate,
    onDelete,
    editing,
    setEditing,
    depth = 0,
    style
}: {
    node: TNode
    onUpdate: (id: string, updates: Partial<TNode>) => void
    onDelete: (id: string) => void
    editing: TEditingState
    setEditing: (state: TEditingState) => void
    depth?: number
    style: TStyle
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const isEditing = editing.id === node.id

    useEffect(function () {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])



    function handleSaveEdit(): void {
        if (editing.value.trim()) {
            onUpdate(node.id, { name: editing.value.trim() })
        }
        setEditing({ id: null, value: '' })
    }

    function handleCancelEdit(): void {
        setEditing({ id: null, value: '' })
    }

    const itemClasses = style === 'card'
        ? 'group/item flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60 rounded transition-colors'
        : 'group/item flex items-center gap-2 px-2 py-1 hover:bg-muted/40 rounded transition-colors'

    return (
        <div>
            <div
                className={itemClasses}
                style={{ paddingLeft: `${depth * 20 + (style === 'card' ? 12 : 8)}px` }}
            >
                {node.type === 'folder' && (
                    <button
                        onClick={function () { onUpdate(node.id, { isExpanded: !node.isExpanded }) }}
                        className="p-0.5 hover:bg-muted rounded transition-colors"
                    >
                        {node.isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                    </button>
                )}

                {node.type === 'folder' ? (
                    <Folder className="w-4 h-4 text-foreground/80 flex-shrink-0" />
                ) : (
                    <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}

                {isEditing ? (
                    <div className="flex items-center gap-1 flex-1">
                        <input
                            ref={inputRef}
                            type="text"
                            value={editing.value}
                            onChange={function (e) { setEditing({ id: node.id, value: e.target.value }) }}
                            onKeyDown={function (e) {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                            }}
                            className="flex-1 bg-background border border-border rounded px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                            onClick={handleSaveEdit}
                            className="p-1 hover:bg-muted rounded transition-colors"
                        >
                            <Check className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button
                            onClick={handleCancelEdit}
                            className="p-1 hover:bg-muted rounded transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="flex-1 text-sm select-none">{node.name}</span>
                        <div className="opacity-0 group-hover/item:opacity-100 flex items-center gap-1 transition-opacity">
                            {/* Creation buttons removed */}
                            <button
                                onClick={function () { setEditing({ id: node.id, value: node.name }) }}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                title="Rename"
                            >
                                <Edit2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                            <button
                                onClick={function () { onDelete(node.id) }}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                title="Delete"
                            >
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {node.type === 'folder' && node.isExpanded && node.children && (
                <div>
                    {node.children.map(function (child) {
                        return (
                            <TreeNode
                                key={child.id}
                                node={child}
                                onUpdate={onUpdate}
                                onDelete={onDelete}
                                editing={editing}
                                setEditing={setEditing}
                                depth={depth + 1}
                                style={style}
                            />
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export const fileTreeBlockSpec = createReactBlockSpec(
    {
        type: 'fileTree',
        propSchema: {
            content: {
                default: '.\n├── apps/\n│   ├── web/\n│   │   ├── src/\n│   │   └── package.json\n│   └── api/\n└── packages/\n    └── ui/',
            },
            style: {
                default: 'card',
            },
        },
        content: 'none',
    },
    {
        render: function ({ block, editor }) {
            const content = block.props.content as string
            const style = (block.props.style as TStyle) || 'card'
            const [nodes, setNodes] = useState<TNode[]>(function () { return parseTreeString(content) })
            const [editing, setEditing] = useState<TEditingState>({ id: null, value: '' })

            useEffect(function () {
                const serialized = serializeTree(nodes)
                if (serialized !== content) {
                    editor.updateBlock(block.id, {
                        props: { content: serialized, style }
                    })
                }
            }, [nodes, block.id, editor, content, style])

            function updateNode(id: string, updates: Partial<TNode>): void {
                function updateRecursive(nodeList: TNode[]): TNode[] {
                    return nodeList.map(function (node) {
                        if (node.id === id) {
                            return { ...node, ...updates }
                        }
                        if (node.children) {
                            return { ...node, children: updateRecursive(node.children) }
                        }
                        return node
                    })
                }
                setNodes(updateRecursive(nodes))
            }

            function deleteNode(id: string): void {
                function deleteRecursive(nodeList: TNode[]): TNode[] {
                    return nodeList
                        .filter(function (node) { return node.id !== id })
                        .map(function (node) {
                            if (node.children) {
                                return { ...node, children: deleteRecursive(node.children) }
                            }
                            return node
                        })
                }
                setNodes(deleteRecursive(nodes))
            }



            function toggleStyle(): void {
                editor.updateBlock(block.id, {
                    props: { content, style: style === 'card' ? 'minimal' : 'card' }
                })
            }

            const containerClasses = style === 'card'
                ? 'relative group my-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden'
                : 'relative group my-4'

            const headerClasses = style === 'card'
                ? 'flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40'
                : 'flex items-center justify-between px-2 py-2 mb-2 border-b border-border/50'

            const contentClasses = style === 'card'
                ? 'py-2 max-h-[600px] overflow-y-auto'
                : 'max-h-[600px] overflow-y-auto'

            return (
                <div className={containerClasses}>
                    <div className={headerClasses}>
                        <div className="flex items-center gap-2.5">
                            <FolderTree className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">File Tree</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={toggleStyle}
                                className="px-2 py-1 text-xs hover:bg-muted rounded transition-colors flex items-center gap-1.5"
                                title={style === 'card' ? 'Switch to minimal style' : 'Switch to card style'}
                            >
                                <Palette className="w-3.5 h-3.5" />
                                <span>{style === 'card' ? 'Minimal' : 'Card'}</span>
                            </button>
                        </div>
                    </div>

                    <div className={contentClasses}>
                        {nodes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FolderTree className="w-12 h-12 mb-3 opacity-30" />
                                <p className="text-sm">No files or folders</p>
                                <p className="text-sm">No files or folders</p>
                            </div>
                        ) : (
                            nodes.map(function (node) {
                                return (
                                    <TreeNode
                                        key={node.id}
                                        node={node}
                                        onUpdate={updateNode}
                                        onDelete={deleteNode}
                                        editing={editing}
                                        setEditing={setEditing}
                                        style={style}
                                    />
                                )
                            })
                        )}
                    </div>
                </div>
            )
        },
    }
)