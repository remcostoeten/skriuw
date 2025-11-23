import { Database } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/shared/ui/tooltip'

interface StorageStatusToggleProps {
    onClick: () => void
}

export function StorageStatusToggle({ onClick }: StorageStatusToggleProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onClick}
                        className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-shadow"
                    >
                        <Database className="h-5 w-5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                    <p>Data Browser</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
