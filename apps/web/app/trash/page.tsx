'use client'

import { Trash2 } from 'lucide-react'

import { TrashPanel } from '@/features/backup/components/trash-panel'

export default function TrashPage() {
    return (
        <div className="flex flex-col h-full">
            <div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4">
                <h1 className="text-2xl font-semibold flex items-center gap-2">
                    <Trash2 className="h-6 w-6" />
                    Trash
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Deleted items are kept here for 30 days before being permanently removed
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-lg mx-auto">
                    <TrashPanel />
                </div>
            </div>
        </div>
    )
}
