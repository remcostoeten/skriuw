import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/shared/lib/utils";
import { overlayContentMotion } from "@/shared/ui/overlay-motion";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
	ref,
	className,
	align = "center",
	sideOffset = 4,
	...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
	ref?: React.Ref<React.ElementRef<typeof PopoverPrimitive.Content>>;
}) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				ref={ref}
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-[70] w-80 origin-[--radix-popover-content-transform-origin] rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none",
					overlayContentMotion,
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
