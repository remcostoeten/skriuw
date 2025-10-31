import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

interface FileItemProps {
    id: string;
    name: string;
    path: string;
    level?: number;
    isActive?: boolean;
    onClick?: (id: string) => void;
    // Drag and drop props
    isDragged?: boolean;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

export const FileItem = ({
    id,
    name,
    path,
    level = 0,
    isActive = false,
    onClick,
    isDragged = false,
    onDragStart,
    onDragEnd,
}: FileItemProps) => {
    // Drag event handlers
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        onDragStart?.();
    };

    const handleDragEnd = () => {
        onDragEnd?.();
    };
    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onClick?.(id)}
            className={cn(
                "h-7 w-full rounded-md px-3 text-xs font-medium",
                "flex items-center gap-2 justify-start",
                "transition-all hover:text-foreground active:scale-[0.98]",
                isActive
                    ? "bg-accent text-foreground"
                    : "text-secondary-foreground/80 hover:bg-accent",
                isDragged && "opacity-50 cursor-grabbing",
                !isDragged && "cursor-grab active:cursor-grabbing"
            )}
            style={{ paddingLeft: `${0.75 + level * 0.75}rem` }}
        >
            <FileText className="w-[14px] h-[14px] shrink-0" />
            <span className="truncate">{name}</span>
        </div>
    );
};
