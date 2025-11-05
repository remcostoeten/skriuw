import { cn, noop } from "utils";

export type TDragAnimations = {
    duration: number;
    easing: string;
    draggedOpacity: number;
    activeScale: number;
    haptic: {
        dragStart: number;
        drop: number;
    };
};

export type TDragClasses = {
    isDragged: boolean;
    isEditing: boolean;
    isFocused: boolean;
    isActive?: boolean;
    isDragOver?: boolean;
    dropPosition?: 'before' | 'after' | 'inside' | null;
};

export type TDragStyles = {
    level?: number;
    isDragged?: boolean;
};

export function triggerHaptic(duration: number = 10) {
    if ('vibrate' in navigator) {
        try {
            navigator.vibrate(duration);
        } catch (error) {
            noop();
        }
    }
}

export const dragAnimations: TDragAnimations = {
    duration: 200,
    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    draggedOpacity: 0.6,
    activeScale: 0.98,
    haptic: {
        dragStart: 15,
        drop: 20,
    },
} as const;

export function getDragClasses(params: TDragClasses) {
    const { isDragged, isEditing, isFocused, isActive, isDragOver, dropPosition } = params;
    
    return cn(
        "transition-all touch-none select-none relative",
        `duration-${dragAnimations.duration}`,
        isDragged && [
            `opacity-${Math.round(dragAnimations.draggedOpacity * 100)}`,
            "cursor-grabbing",
            `scale-${Math.round(dragAnimations.activeScale * 100)}`,
            "shadow-lg",
            "z-50",
            "rotate-[2deg]"
        ],
        !isDragged && !isEditing && [
            "cursor-grab",
            `active:scale-${Math.round(dragAnimations.activeScale * 100)}`,
            "active:transition-none"
        ],
        isFocused && !isActive && !isDragged && "ring-1 ring-primary/50 ring-offset-1",
        isDragOver && dropPosition === 'before' && "before:content-[''] before:absolute before:left-0 before:right-0 before:-top-[2px] before:h-[2px] before:bg-primary before:rounded-full before:shadow-[0_0_8px_rgba(var(--primary),0.5)]",
        isDragOver && dropPosition === 'after' && "after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-[2px] after:h-[2px] after:bg-primary after:rounded-full after:shadow-[0_0_8px_rgba(var(--primary),0.5)]",
        isDragOver && dropPosition === 'inside' && "bg-primary/10 ring-2 ring-primary/50 ring-inset shadow-[inset_0_0_12px_rgba(var(--primary),0.2)]"
    );
}

export function getDragStyles(params: TDragStyles) {
    const { level = 0, isDragged } = params;
    
    return {
        paddingLeft: `${0.75 + level * 0.75}rem`,
        willChange: isDragged ? 'transform, opacity' : 'auto',
        transform: isDragged ? 'translateZ(0)' : undefined,
    };
}

export function hapticDragStart() {
    triggerHaptic(dragAnimations.haptic.dragStart);
}

export function hapticDrop() {
    triggerHaptic(dragAnimations.haptic.drop);
}