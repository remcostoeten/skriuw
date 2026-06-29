import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/shared/lib/utils";
import { tooltipContentMotion } from "@/shared/ui/overlay-motion";

function TooltipProvider({
	delayDuration = 350,
	skipDelayDuration = 120,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return (
		<TooltipPrimitive.Provider
			delayDuration={delayDuration}
			skipDelayDuration={skipDelayDuration}
			{...props}
		/>
	);
}

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
	shortcut?: React.ReactNode;
};

const TooltipContent = React.forwardRef<
	React.ElementRef<typeof TooltipPrimitive.Content>,
	TooltipContentProps
>(({ className, sideOffset = 4, collisionPadding = 8, shortcut, children, ...props }, ref) => (
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content
			ref={ref}
			sideOffset={sideOffset}
			collisionPadding={collisionPadding}
			className={cn(
				"z-50 origin-[--radix-tooltip-content-transform-origin] overflow-hidden border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground data-[state=instant-open]:duration-0",
				tooltipContentMotion,
				className,
			)}
			{...props}
		>
			{shortcut ? (
				<span className="flex items-center gap-3">
					<span className="min-w-0 truncate">{children}</span>
					<kbd className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground">
						{shortcut}
					</kbd>
				</span>
			) : (
				children
			)}
		</TooltipPrimitive.Content>
	</TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
