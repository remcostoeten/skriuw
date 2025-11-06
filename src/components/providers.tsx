"use client";

import { ToastProvider } from "@/components/error-toast";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ShortcutProvider } from "@/components/shortcut-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { useEffect } from "react";
import { removeDraggingClass } from "@/components/file-tree/drag-animations";

type props = {
    children: React.ReactNode;
}

export function Providers({ children }: props) {
    useEffect(() => {
        // Disable default Tauri webview context menu
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        // Global safety: ensure dragging class is removed on any dragend event
        const handleGlobalDragEnd = () => {
            removeDraggingClass();
        };

        // Also ensure it's removed on page visibility change or focus
        const handleVisibilityChange = () => {
            if (document.hidden) {
                removeDraggingClass();
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('dragend', handleGlobalDragEnd);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup on mount to remove any stuck class
        removeDraggingClass();

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('dragend', handleGlobalDragEnd);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Ensure cleanup on unmount
            removeDraggingClass();
        };
    }, []);

    return (
        <ThemeProvider>
            <ToastProvider>
                <TooltipProvider delayDuration={50}>
                    <ShortcutProvider>
                        {children}
                    </ShortcutProvider>
                </TooltipProvider>
            </ToastProvider>
        </ThemeProvider>
    )
}
