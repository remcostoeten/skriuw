import * as React from 'react'
import {
    Smile,
    Calendar,
    Clock,
    Tag,
    ChevronsRight,
    LayoutTemplate,
    Book,
    FileType,
    ChevronDown,
    ChevronRight,
    Hash,
    MoreHorizontal
} from 'lucide-react'
import { cn } from '@skriuw/shared'
import {
    Button,
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Separator,
    Badge
} from '@skriuw/ui'

interface EditorHeaderProps {
    title: string
    setTitle: (title: string) => void
    icon?: string
    setIcon?: (icon: string) => void
    createdAt?: number | Date
    updatedAt?: number | Date
    tags?: string[]
    className?: string
}

const EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '🚀', '💡', '📝', '✅', '🎨', '🔥', '✨', '🎉', '💻', '🤖', '🌲', '🍕', '☕', '📚', '⚡']

export function EditorHeader({
    title,
    setTitle,
    icon,
    setIcon,
    createdAt,
    updatedAt,
    tags = [],
    className,
}: EditorHeaderProps) {
    const [isIconPickerOpen, setIsIconPickerOpen] = React.useState(false)
    const [isInfoOpen, setIsInfoOpen] = React.useState(true)
    const [isMorePropsOpen, setIsMorePropsOpen] = React.useState(false)

    // Format date helper
    const formatDate = (date?: number | Date) => {
        if (!date) return 'Just now'
        const d = new Date(date)
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
            -Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)),
            'day'
        )
    }

    return (
        <div className={cn("group max-w-4xl mx-auto px-6 pt-12 pb-4 space-y-6", className)}>
            {/* Icon & Title Section */}
            <div className="space-y-4">
                {/* Icon Trigger */}
                <div className="h-8 flex items-center">
                    {icon ? (
                        <Popover open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="text-4xl h-auto p-2 hover:bg-muted/50 -ml-2">
                                    {icon}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2" align="start">
                                <div className="grid grid-cols-5 gap-1">
                                    {EMOJIS.map(emoji => (
                                        <Button
                                            key={emoji}
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-lg"
                                            onClick={() => {
                                                setIcon?.(emoji)
                                                setIsIconPickerOpen(false)
                                            }}
                                        >
                                            {emoji}
                                        </Button>
                                    ))}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mt-2 text-xs text-muted-foreground"
                                    onClick={() => {
                                        setIcon?.(undefined!)
                                        setIsIconPickerOpen(false)
                                    }}
                                >
                                    Remove icon
                                </Button>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity -ml-3"
                            onClick={() => setIsIconPickerOpen(true)}
                        >
                            <Smile className="w-4 h-4 mr-2" />
                            Add icon
                        </Button>
                    )}
                </div>

                {/* Title Input */}
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled"
                    className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 text-foreground"
                />
            </div>

            {/* Info Block */}
            <Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen} className="space-y-4">
                <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="-ml-3 h-6 text-muted-foreground hover:text-foreground">
                            {isInfoOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                            Info
                        </Button>
                    </CollapsibleTrigger>
                    {!isInfoOpen && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-left-2">
                            <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {formatDate(createdAt)}</span>
                            {tags.length > 0 && <span className="flex items-center"><Tag className="w-3 h-3 mr-1" /> {tags.length} tags</span>}
                        </div>
                    )}
                </div>

                <CollapsibleContent className="space-y-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                    <div className="pl-1">
                        <Separator className="mb-4 bg-border/50" />

                        {/* Top Properties Grid */}
                        <div className="grid grid-cols-[120px_1fr] gap-y-3 gap-x-4 text-sm items-center">
                            {/* Tags */}
                            <div className="flex items-center text-muted-foreground">
                                <Tag className="w-4 h-4 mr-2" />
                                Tags
                            </div>
                            <div className="flex items-center flex-wrap gap-1">
                                {tags.length > 0 ? (
                                    tags.map(tag => (
                                        <Badge key={tag} variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted/80 rounded-sm font-normal text-xs px-1.5">
                                            {tag}
                                        </Badge>
                                    ))
                                ) : (
                                    <div className="text-muted-foreground/50 italic flex items-center text-xs cursor-pointer hover:text-muted-foreground transition-colors">
                                        Empty
                                    </div>
                                )}
                            </div>

                            {/* Created */}
                            <div className="flex items-center text-muted-foreground">
                                <Calendar className="w-4 h-4 mr-2" />
                                Created
                            </div>
                            <div className="text-foreground/80">{formatDate(createdAt)}</div>

                            {/* Updated */}
                            <div className="flex items-center text-muted-foreground">
                                <Clock className="w-4 h-4 mr-2" />
                                Updated
                            </div>
                            <div className="text-foreground/80">{formatDate(updatedAt)}</div>
                        </div>

                        {/* More Properties Collapsible */}
                        <Collapsible open={isMorePropsOpen} onOpenChange={setIsMorePropsOpen} className="mt-2">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="-ml-2 h-8 text-xs text-muted-foreground hover:text-foreground mt-2">
                                    {isMorePropsOpen ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                                    {isMorePropsOpen ? 'Hide properties' : '6 more properties'}
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-3 space-y-3 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 slide-in-from-top-2">
                                <div className="grid grid-cols-[120px_1fr] gap-y-3 gap-x-4 text-sm items-center">
                                    {/* Page Width */}
                                    <div className="flex items-center text-muted-foreground">
                                        <LayoutTemplate className="w-4 h-4 mr-2" />
                                        Page width
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Badge variant="outline" className="rounded-sm font-normal text-xs cursor-pointer hover:bg-muted">Standard</Badge>
                                        <Badge variant="ghost" className="rounded-sm font-normal text-xs text-muted-foreground hover:bg-muted cursor-pointer">Full width</Badge>
                                    </div>

                                    {/* Journal */}
                                    <div className="flex items-center text-muted-foreground">
                                        <Book className="w-4 h-4 mr-2" />
                                        Journal
                                    </div>
                                    <div className="text-foreground/80 flex items-center">
                                        <input type="checkbox" className="rounded border-muted-foreground/40 bg-transparent" />
                                    </div>

                                    {/* Template */}
                                    <div className="flex items-center text-muted-foreground">
                                        <FileType className="w-4 h-4 mr-2" />
                                        Template
                                    </div>
                                    <div className="text-foreground/80 flex items-center">
                                        <input type="checkbox" className="rounded border-muted-foreground/40 bg-transparent" />
                                    </div>

                                    {/* Edgeless theme */}
                                    <div className="flex items-center text-muted-foreground">
                                        <MoreHorizontal className="w-4 h-4 mr-2" />
                                        Theme
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Badge variant="outline" className="rounded-sm font-normal text-xs">Auto</Badge>
                                    </div>

                                    {/* Created by */}
                                    <div className="flex items-center text-muted-foreground">
                                        <Hash className="w-4 h-4 mr-2" />
                                        Doc ID
                                    </div>
                                    <div className="text-xs text-foreground/50 font-mono">
                                        efbf07eb...
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            <Separator className="bg-border/30 mt-8" />
        </div>
    )
}
