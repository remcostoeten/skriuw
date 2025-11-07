"use client";

import { ToastProvider } from "@/components/error-toast";
import { removeDraggingClass } from "@/components/file-tree/drag-animations";
import { ThemeProvider } from "@/components/theme-provider";
import { SearchStateProvider } from "@/modules/search/context/search-state-context";
import { ShortcutProvider } from "@/modules/shortcuts";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { useEffect } from "react";

export function Providers({ children }: { children: Children }) {
    useEffect(() => {
        // Remove global context menu prevention to allow custom context menus
        // function handleContextMenu(e: MouseEvent) {
        //     e.preventDefault();
        // }

        function handleGlobalDragEnd() {
            removeDraggingClass();
        }

        function handleVisibilityChange() {
            if (document.hidden) {
                removeDraggingClass();
            }
        }

        // document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('dragend', handleGlobalDragEnd);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        removeDraggingClass();

        return () => {
            // document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('dragend', handleGlobalDragEnd);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            removeDraggingClass();
        };
    }, []);

    return (
        <ThemeProvider>
            <ToastProvider>
                <TooltipProvider delayDuration={50}>
                    <ShortcutProvider>
                        <SearchStateProvider>
                            {children}
                        </SearchStateProvider>
                    </ShortcutProvider>
                </TooltipProvider>
            </ToastProvider>
        </ThemeProvider>
    )
}
