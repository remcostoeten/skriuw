import { cn } from "@skriuw/shared"
import { X } from "lucide-react"

type Props = {
    name: string
    color?: string
    onRemove?: () => void
    onClick?: () => void
    className?: string
    size?: 'sm' | 'md'
}

export function TagBadge({ name, color = '#6366f1', onRemove, onClick, className, size = 'sm' }: Props) {
    const sizeClasses = size === 'sm'
        ? 'text-xs px-1.5 py-0.5 gap-1'
        : 'text-sm px-2 py-1 gap-1.5'

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md font-medium transition-colors",
                onClick && "cursor-pointer hover:opacity-80",
                sizeClasses,
                className
            )}
            style={{
                backgroundColor: `${color}20`,
                color: color,
                border: `1px solid ${color}40`
            }}
            onClick={onClick}
        >
            <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
            />
            {name}
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove()
                    }}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    aria-label={`Remove ${name} tag`}
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </span>
    )
}
