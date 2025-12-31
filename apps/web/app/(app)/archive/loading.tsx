import { Skeleton } from '@skriuw/ui/skeleton'

export default function ArchiveLoading() {
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6" />
                    <Skeleton className="h-7 w-32" />
                </div>
                <Skeleton className="h-4 w-64 mt-2" />
            </div>

            {/* Tabs */}
            <div className="border-b border-border/69">
                <div className="flex gap-1 px-6 h-11">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-16" />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-lg mx-auto space-y-6">
                    {/* Page Title */}
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-80" />
                    </div>

                    {/* Panel Content */}
                    <Skeleton className="h-96 w-full rounded-lg" />
                </div>
            </div>
        </div>
    )
}
