import { ToastProvider } from "@/components/error-toast";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ShortcutProvider } from "@/components/shortcut-provider";

type props = {
    children: React.ReactNode;
}

export function Providers({ children }: props) {
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
