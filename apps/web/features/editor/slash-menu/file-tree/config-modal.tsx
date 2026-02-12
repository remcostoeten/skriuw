'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
    X,
    FolderPlus,
    FilePlus,
    Trash2,
    Save,
    Upload,
    Download,
    ChevronRight,
    ChevronDown,
    Folder,
    File
} from 'lucide-react'
import { cn } from '@skriuw/shared'
import { generateId } from '@skriuw/shared'
import type { TNode, TFile, TComponent } from './types'
import { buildTreeFromFiles, flattenTreeToFiles, updateNode, deleteNode, addChildNode, findNodeById } from './utils'
import { getLanguageFromPath } from './types'

type ConfigModalProps = {
    isOpen: boolean
    onClose: () => void
    component: TComponent
    onSave: (component: TComponent) => void
}

type TreeEditorNodeProps = {
    node: TNode
    depth: number
    onUpdate: (id: string, updates: Partial<TNode>) => void
    onDelete: (id: string) => void
    onAddChild: (parentId: string, type: 'file' | 'folder') => void
    onSelect: (node: TNode) => void
    selectedId: string | null
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function useFocusTrap(isActive: boolean) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isActive || !containerRef.current) return

        const container = containerRef.current
        const focusableElements = container.querySelectorAll(FOCUSABLE_SELECTOR)
        const firstFocusable = focusableElements[0] as HTMLElement
        const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement

        firstFocusable?.focus()

        const handleTabKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return

            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    e.preventDefault()
                    lastFocusable?.focus()
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    e.preventDefault()
                    firstFocusable?.focus()
                }
            }
        }

        container.addEventListener('keydown', handleTabKey)
        return () => container.removeEventListener('keydown', handleTabKey)
    }, [isActive])

    return containerRef
}

export function ConfigModal({ isOpen, onClose, component, onSave }: ConfigModalProps) {
    const [nodes, setNodes] = useState<TNode[]>(() => buildTreeFromFiles(component.files))
    const [selectedNode, setSelectedNode] = useState<TNode | null>(null)
    const [editingContent, setEditingContent] = useState('')
    const [componentName, setComponentName] = useState(component.name)
    const [componentVersion, setComponentVersion] = useState(component.version || '1.0.0')
    const focusTrapRef = useFocusTrap(isOpen)

    useEffect(() => {
        if (selectedNode?.type === 'file') {
            setEditingContent(selectedNode.content || '')
        }
    }, [selectedNode])

    const handleNodeUpdate = useCallback((id: string, updates: Partial<TNode>) => {
        setNodes((prev) => updateNode(prev, id, updates))
        if (selectedNode?.id === id) {
            setSelectedNode((prev) => (prev ? { ...prev, ...updates } : null))
        }
    }, [selectedNode])

    const handleNodeDelete = useCallback((id: string) => {
        setNodes((prev) => deleteNode(prev, id))
        if (selectedNode?.id === id) {
            setSelectedNode(null)
        }
    }, [selectedNode])

    const handleAddChild = useCallback((parentId: string, type: 'file' | 'folder') => {
        const childName = type === 'folder' ? 'New Folder' : 'new-file.ts'
        setNodes((prev) => {
            const parent = findNodeById(prev, parentId)
            const parentPath = parent?.path || ''
            const childPath = parentPath ? `${parentPath}/${childName}` : childName

            const newNode: TNode = {
                id: generateId(),
                name: childName,
                type,
                path: childPath,
                children: type === 'folder' ? [] : undefined,
                content: type === 'file' ? '' : undefined,
                isExpanded: true
            }
            return addChildNode(prev, parentId, newNode)
        })
    }, [])

    const handleAddRoot = useCallback((type: 'file' | 'folder') => {
        const newNode: TNode = {
            id: generateId(),
            name: type === 'folder' ? 'new-folder' : 'new-file.ts',
            type,
            path: type === 'folder' ? 'new-folder' : 'new-file.ts',
            children: type === 'folder' ? [] : undefined,
            content: type === 'file' ? '' : undefined,
            isExpanded: true
        }
        setNodes((prev) => [...prev, newNode])
    }, [])

    const handleContentChange = useCallback((content: string) => {
        setEditingContent(content)
        if (selectedNode?.id) {
            handleNodeUpdate(selectedNode.id, { content })
        }
    }, [selectedNode, handleNodeUpdate])

    const handleSave = useCallback(() => {
        const files = flattenTreeToFiles(nodes)
        onSave({
            ...component,
            name: componentName,
            version: componentVersion,
            files
        })
        onClose()
    }, [nodes, componentName, componentVersion, component, onSave, onClose])

    const handleExportJson = useCallback(() => {
        const files = flattenTreeToFiles(nodes)
        const exportData: TComponent = {
            name: componentName,
            version: componentVersion,
            files
        }
        const json = JSON.stringify(exportData, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${componentName.toLowerCase().replace(/\s+/g, '-')}-tree.json`
        a.click()
        URL.revokeObjectURL(url)
    }, [nodes, componentName, componentVersion])

    const handleImportJson = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return

            try {
                const text = await file.text()
                const data = JSON.parse(text)

                if (!data || typeof data.name !== 'string' || !Array.isArray(data.files)) {
                    console.error('Invalid file tree JSON: missing required fields')
                    return
                }

                if (!data.files.every((f: unknown) => typeof (f as TFile).path === 'string')) {
                    console.error('Invalid file entries in JSON: each entry must have a path string')
                    return
                }

                setComponentName(data.name)
                setComponentVersion(data.version || '1.0.0')
                setNodes(buildTreeFromFiles(data.files))
            } catch (err) {
                console.error('Failed to import JSON:', err)
            }
        }
        input.click()
    }, [])

    const handleClose = useCallback(() => {
        onClose()
    }, [onClose])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose()
            }
        },
        [handleClose]
    )

    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
                handleClose()
            }
        },
        [handleClose]
    )

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm isolate"
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-modal-title"
            onKeyDown={handleKeyDown}
            onClick={handleBackdropClick}
        >
            <div
                ref={focusTrapRef}
                className="w-full max-w-5xl h-[80vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h2 id="config-modal-title" className="text-lg font-semibold">
                        Configure File Tree
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleImportJson}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
                            aria-label="Import from JSON"
                        >
                            <Upload className="w-4 h-4" />
                            Import
                        </button>
                        <button
                            type="button"
                            onClick={handleExportJson}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
                            aria-label="Export to JSON"
                        >
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/3 border-r border-border flex flex-col">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                            <button
                                type="button"
                                onClick={() => handleAddRoot('folder')}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-background hover:bg-muted border border-border rounded transition-colors"
                                aria-label="Add folder"
                            >
                                <FolderPlus className="w-3.5 h-3.5" />
                                Folder
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAddRoot('file')}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-background hover:bg-muted border border-border rounded transition-colors"
                                aria-label="Add file"
                            >
                                <FilePlus className="w-3.5 h-3.5" />
                                File
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-2" role="tree" aria-label="File tree editor">
                            {nodes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <p className="text-sm">No files yet</p>
                                    <p className="text-xs">Add a folder or file to get started</p>
                                </div>
                            ) : (
                                nodes.map((node) => (
                                    <TreeEditorNode
                                        key={node.id}
                                        node={node}
                                        depth={0}
                                        onUpdate={handleNodeUpdate}
                                        onDelete={handleNodeDelete}
                                        onAddChild={handleAddChild}
                                        onSelect={setSelectedNode}
                                        selectedId={selectedNode?.id || null}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col">
                        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/30">
                            <div className="flex items-center gap-2">
                                <label htmlFor="component-name" className="text-sm text-muted-foreground">
                                    Name:
                                </label>
                                <input
                                    id="component-name"
                                    type="text"
                                    value={componentName}
                                    onChange={(e) => setComponentName(e.target.value)}
                                    className="px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label htmlFor="component-version" className="text-sm text-muted-foreground">
                                    Version:
                                </label>
                                <input
                                    id="component-version"
                                    type="text"
                                    value={componentVersion}
                                    onChange={(e) => setComponentVersion(e.target.value)}
                                    className="px-2 py-1 text-sm bg-background border border-border rounded w-24 focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            {selectedNode?.type === 'file' ? (
                                <div className="h-full flex flex-col">
                                    <div className="px-4 py-2 border-b border-border bg-muted/20">
                                        <span className="text-sm font-medium">{selectedNode.path || selectedNode.name}</span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                            ({getLanguageFromPath(selectedNode.path || selectedNode.name)})
                                        </span>
                                    </div>
                                    <textarea
                                        value={editingContent}
                                        onChange={(e) => handleContentChange(e.target.value)}
                                        className="flex-1 p-4 font-mono text-sm bg-background resize-none focus:outline-none"
                                        placeholder="Enter file content..."
                                        aria-label="File content editor"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <p className="text-sm">Select a file to edit its content</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border bg-muted/30">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm hover:bg-muted rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}

function TreeEditorNode({
    node,
    depth,
    onUpdate,
    onDelete,
    onAddChild,
    onSelect,
    selectedId
}: TreeEditorNodeProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(node.name)
    const isSelected = selectedId === node.id

    const handleSaveEdit = useCallback(() => {
        if (editValue.trim()) {
            const newName = editValue.trim()
            const pathParts = node.path ? node.path.split('/') : []
            pathParts[pathParts.length - 1] = newName
            const newPath = pathParts.join('/')
            onUpdate(node.id, { name: newName, path: newPath || newName })
        }
        setIsEditing(false)
    }, [editValue, node.id, node.path, onUpdate])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                handleSaveEdit()
            } else if (e.key === 'Escape') {
                setEditValue(node.name)
                setIsEditing(false)
            }
        },
        [handleSaveEdit, node.name]
    )

    return (
        <div role="treeitem" aria-selected={isSelected} aria-expanded={node.type === 'folder' ? (node.isExpanded ?? false) : undefined}>
            <div
                className={cn(
                    'group flex items-center gap-1 px-2 py-1 rounded-sm cursor-pointer transition-colors',
                    'hover:bg-muted/50',
                    isSelected && 'bg-accent text-accent-foreground'
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => onSelect(node)}
            >
                {node.type === 'folder' ? (
                    <button
                        type="button"
                        className="p-0.5 hover:bg-muted rounded"
                        onClick={(e) => {
                            e.stopPropagation()
                            onUpdate(node.id, { isExpanded: !node.isExpanded })
                        }}
                        aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {node.isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                    </button>
                ) : (
                    <span className="w-4" />
                )}

                {node.type === 'folder' ? (
                    <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                    <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}

                {isEditing ? (
                    <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSaveEdit}
                        onKeyDown={handleKeyDown}
                        className="flex-1 px-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                    />
                ) : (
                    <span
                        className="flex-1 text-sm truncate"
                        onDoubleClick={() => setIsEditing(true)}
                    >
                        {node.name}
                    </span>
                )}

                <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5 transition-opacity">
                    {node.type === 'folder' && (
                        <>
                            <button
                                type="button"
                                className="p-1 hover:bg-muted rounded"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onAddChild(node.id, 'folder')
                                }}
                                aria-label="Add subfolder"
                            >
                                <FolderPlus className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <button
                                type="button"
                                className="p-1 hover:bg-muted rounded"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onAddChild(node.id, 'file')
                                }}
                                aria-label="Add file"
                            >
                                <FilePlus className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className="p-1 hover:bg-destructive/20 rounded"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete(node.id)
                        }}
                        aria-label="Delete"
                    >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                </div>
            </div>

            {node.type === 'folder' && node.isExpanded && node.children && (
                <div role="group">
                    {node.children.map((child) => (
                        <TreeEditorNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onAddChild={onAddChild}
                            onSelect={onSelect}
                            selectedId={selectedId}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
