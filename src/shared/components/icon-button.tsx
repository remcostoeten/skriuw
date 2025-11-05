import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/shared/components/ui/tooltip";
import * as React from "react";
import { cn } from "utils";

type props = {
    icon: React.ReactNode;
    tooltip: string;
    onClick?: () => void;
    variant?: "default" | "ghost";
    disabled?: boolean;
}

export const IconButton = React.memo(function IconButton(props: props) {
    const { icon, tooltip, onClick, variant = "default", disabled } = props;

    const styledIcon = React.useMemo(() => {
        if (React.isValidElement(icon)) {
            const existingClassName = (icon as React.ReactElement).props?.className || "";
            return React.cloneElement(icon as React.ReactElement, {
                className: cn(
                    "w-[18px] text-muted-foreground h-[18px]",
                    existingClassName
                ),
            });
        }
        return icon;
    }, [icon]);

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (onClick && !disabled) {
            onClick();
        }
    }, [onClick, disabled]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={handleClick}
                    disabled={disabled}
                    className={cn(
                        "inline-flex items-center justify-center rounded-md text-sm font-medium",
                        "whitespace-nowrap focus-visible:outline-none focus-visible:ring-1",
                        "focus-visible:ring-border/60 disabled:pointer-events-none disabled:opacity-50",
                        "transition-all active:scale-95 h-7 w-7",
                        variant === "default"
                            ? "fill-muted-foreground hover:fill-foreground hover:bg-accent hover:text-accent-foreground"
                            : "group hover:bg-transparent stroke-muted-foreground hover:stroke-foreground"
                    )}
                >
                    {styledIcon}
                </button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    );
});
