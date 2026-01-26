'use client'

import { useState } from 'react'
import { useFilesQuery } from '../hooks/use-files-query'
import { useDestroyFileMutation } from '../hooks/use-destroy-file'
import { Loader2, Image as ImageIcon, FileIcon, Trash2 } from 'lucide-react'
import { cn } from '@skriuw/shared'
import { Button } from '@skriuw/ui'

type MediaPickerProps = {
    onSelect: (url: string) => void
    className?: string
}

export function MediaPicker({ onSelect, className }: MediaPickerProps) {
    const { data: files = [], isLoading } = useFilesQuery()
    const { mutateAsync: destroyFile, isPending: isDeleting } = useDestroyFileMutation()
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (!confirm('Delete this file from library?')) return

        setDeletingId(id)
        try {
            await destroyFile(id)
        } catch (error) {
            console.error('Failed to delete file', error)
            alert('Failed to delete file')
        } finally {
            setDeletingId(null)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!files || files.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <ImageIcon className="w-8 h-8 opacity-50" />
                <p className="text-sm">No files uploaded yet</p>
                <p className="text-xs opacity-70">Upload an image to see it here</p>
            </div>
        )
    }

    return (
        <div className={cn("grid grid-cols-3 gap-2 p-1 max-h-64 overflow-y-auto", className)}>
            {files.map(file => (
                <div
                    key={file.id}
                    className="relative aspect-square rounded-md overflow-hidden border border-border group hover:border-primary transition-colors cursor-pointer"
                    onClick={() => onSelect(file.url)}
                    title={file.name}
                >
                    {file.type.startsWith('image/') ? (
                        <img
                            src={file.url}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full bg-muted">
                            <FileIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                        <div className="flex justify-end">
                            <button
                                onClick={(e) => handleDelete(e, file.id)}
                                disabled={deletingId === file.id}
                                className="p-1 bg-destructive/80 text-destructive-foreground rounded-md hover:bg-destructive transition-colors"
                                title="Delete file"
                            >
                                {deletingId === file.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Trash2 className="w-3 h-3" />
                                )}
                            </button>
                        </div>
                        <p className="text-[10px] text-white truncate px-1">{file.name}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}
