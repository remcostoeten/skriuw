"use client";

import { ToastProvider } from "@/components/error-toast";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ShortcutProvider } from "@/components/shortcut-provider";
import { useEffect } from "react";

type props = {
    children: React.ReactNode;
}

export function Providers({ children }: props) {
    useEffect(() => {
        // Disable default Tauri webview context menu
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        document.addEventListener('contextmenu', handleContextMenu);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    return (
        <ToastProvider>
            <TooltipProvider delayDuration={50}>
                <ShortcutProvider>
                    {children}
                </ShortcutProvider>
            </TooltipProvider>
        </ToastProvider>
    )
}
