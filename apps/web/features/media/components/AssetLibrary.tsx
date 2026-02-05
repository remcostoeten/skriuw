'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAssets, type AssetSort, type AssetOrder } from '../api/queries/get-assets'
import { updateAsset } from '../api/mutations/update-asset'
import { destroyFile } from '../api/mutations/destroy-file'
import {
    Loader2, Search, Grid, List as ListIcon, MoreVertical,
    File as FileIcon, Trash2, Edit2, Link as LinkIcon, Download, Eye
} from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    Button, Input, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@skriuw/ui'
import { cn } from '@skriuw/shared'
import { formatDistanceToNow } from 'date-fns'
import { useUpload } from '@/features/uploads/use-upload'

type AssetLibraryProps = {
    onSelect?: (url: string, file: any) => void
    className?: string
}

export function AssetLibrary({ onSelect, className }: AssetLibraryProps) {
    const queryClient = useQueryClient()
    const [view, setView] = useState<'grid' | 'list'>('grid')
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<AssetSort>('createdAt')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')

    // Upload hook
    const { startUpload, isUploading } = useUpload({
        onUploadComplete: () => {
            queryClient.invalidateQueries({ queryKey: ['assets'] })
        }
    })

    // Data query
    const { data, isLoading } = useQuery({
        queryKey: ['assets', { page, search, sort }],
        queryFn: () => getAssets({ page, limit: 20, search, sort }),
    })

    // Mutations
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => updateAsset(id, data),
        onSuccess: () => {
            setEditingId(null)
            queryClient.invalidateQueries({ queryKey: ['assets'] })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: destroyFile,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] })
    })

    const handleRename = (id: string, currentName: string) => {
        setEditingId(id)
        setEditName(currentName)
    }

    const saveRename = async () => {
        if (!editingId || !editName.trim()) return
        await updateMutation.mutateAsync({ id: editingId, data: { name: editName } })
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            await startUpload(Array.from(e.target.files))
        }
    }

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url)
        // could allow toast notification here
    }

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    const items = data?.items || []

    return (
        <div className={cn("flex flex-col h-full min-h-[400px] gap-4", className)}>
            {/* Header / Toolbar */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search assets..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input
                            type="file"
                            multiple
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                        />
                        <Button disabled={isUploading}>
                            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Upload
                        </Button>
                    </div>

                    <div className="border rounded-md flex">
                        <Button
                            variant={view === 'grid' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => setView('grid')}
                            className="rounded-r-none"
                        >
                            <Grid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={view === 'list' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => setView('list')}
                            className="rounded-l-none"
                        >
                            <ListIcon className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0 border rounded-md p-4">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p>No assets found</p>
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {items.map(item => (
                            <div key={item.id} className="group relative border rounded-md overflow-hidden aspect-square hover:ring-2 hover:ring-primary/50 transition-all">
                                {item.type.startsWith('image/') ? (
                                    <img
                                        src={item.url}
                                        alt={item.name}
                                        className="w-full h-full object-cover cursor-pointer"
                                        onClick={() => onSelect?.(item.url, item)}
                                    />
                                ) : (
                                    <div
                                        className="w-full h-full flex items-center justify-center bg-muted cursor-pointer"
                                        onClick={() => onSelect?.(item.url, item)}
                                    >
                                        <FileIcon className="h-10 w-10 text-muted-foreground" />
                                    </div>
                                )}

                                <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-white transform translate-y-full group-hover:translate-y-0 transition-transform">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs truncate max-w-[80%]">{item.name}</p>
                                        <AssetMenu
                                            item={item}
                                            onRename={handleRename}
                                            onDelete={(id) => deleteMutation.mutate(id)}
                                            onCopy={copyToClipboard}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md group">
                                <div
                                    className="flex items-center gap-3 flex-1 cursor-pointer"
                                    onClick={() => onSelect?.(item.url, item)}
                                >
                                    <div className="h-10 w-10 rounded overflow-hidden bg-muted flex-shrink-0">
                                        {item.type.startsWith('image/') ? (
                                            <img src={item.url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full"><FileIcon className="h-5 w-5" /></div>
                                        )}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        {editingId === item.id ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <Input
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    className="h-7 text-xs"
                                                    onKeyDown={e => e.key === 'Enter' && saveRename()}
                                                    autoFocus
                                                />
                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveRename}>✓</Button>
                                            </div>
                                        ) : (
                                            <span className="text-sm font-medium truncate">{item.name}</span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(item.createdAt)} ago • {(item.size / 1024).toFixed(1)} KB
                                        </span>
                                    </div>
                                </div>
                                <AssetMenu
                                    item={item}
                                    onRename={handleRename}
                                    onDelete={(id) => deleteMutation.mutate(id)}
                                    onCopy={copyToClipboard}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                >
                    Previous
                </Button>
                <span>Page {page} of {data?.totalPages || 1}</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= (data?.totalPages || 1)}
                >
                    Next
                </Button>
            </div>
        </div>
    )
}

function AssetMenu({ item, onRename, onDelete, onCopy }: any) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-white hover:bg-white/20">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onCopy(item.url)}>
                    <LinkIcon className="mr-2 h-4 w-4" /> Copy URL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRename(item.id, item.name)}>
                    <Edit2 className="mr-2 h-4 w-4" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(item.url, '_blank')}>
                    <Download className="mr-2 h-4 w-4" /> Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(item.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
