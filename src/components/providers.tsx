import { ToastProvider } from "@/components/error-toast";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ThemeProvider } from "@/components/theme-provider";

type props = {
    children: React.ReactNode;
}

export function Providers({ children }: props) {
    return (
        <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
            <ToastProvider>
                <TooltipProvider delayDuration={50}>
                    {children}
                </TooltipProvider>
            </ToastProvider>
        </ThemeProvider>
    )
}
