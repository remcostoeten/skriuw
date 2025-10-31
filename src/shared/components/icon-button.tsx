import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "utils";

type props = {
    icon: React.ReactNode;
    tooltip: string;
    onClick?: () => void;
    variant?: "default" | "ghost";
    disabled?: boolean;
}

export function IconButton(props: props) {
    const { icon, tooltip, onClick, variant = "default", disabled } = props;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    disabled={disabled}
                    className={cn(
                        "inline-flex items-center justify-center rounded-md text-sm font-medium",
                        "whitespace-nowrap focus-visible:outline-none focus-visible:ring-1",
                        "focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                        "transition-all active:scale-95 h-7 w-7",
                        variant === "default"
                            ? "fill-muted-foreground hover:fill-foreground hover:bg-accent hover:text-accent-foreground"
                            : "group hover:bg-transparent stroke-muted-foreground hover:stroke-foreground"
                    )}
                >
                    {icon}
                </button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    );
}
