import { ToastProvider } from "@/components/error-toast";
import { TooltipProvider } from "@radix-ui/react-tooltip";

type props = {
    children: React.ReactNode;
}

export function Providers({ children }: props) {
    return (
        <ToastProvider>
            <TooltipProvider delayDuration={50}>
                {children}
            </TooltipProvider>
        </ToastProvider>
    )
}
