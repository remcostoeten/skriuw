import { assertEmpty, isSafari } from "@blocknote/core";
import { components as baseComponents } from "@blocknote/mantine";
import type { ComponentProps } from "@blocknote/react";
import {
	Button as MantineButton,
	CheckIcon as MantineCheckIcon,
	Menu as MantineMenu,
	Popover as MantinePopover,
} from "@mantine/core";
import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

function PortalMenuRoot(props: ComponentProps["Generic"]["Menu"]["Root"]) {
	const { children, onOpenChange, position, sub, ...rest } = props;

	assertEmpty(rest);

	if (sub) {
		return (
			<MantineMenu.Sub
				transitionProps={{ duration: 250, exitDelay: 250 }}
				withinPortal
				middlewares={{ flip: true, shift: true, inline: false, size: true }}
				onChange={onOpenChange}
				position={position}
			>
				{children}
			</MantineMenu.Sub>
		);
	}

	return (
		<MantineMenu
			withinPortal
			middlewares={{ flip: true, shift: true, inline: false, size: true }}
			onChange={onOpenChange}
			position={position}
			returnFocus={false}
		>
			{children}
		</MantineMenu>
	);
}

function PortalPopoverRoot(props: ComponentProps["Generic"]["Popover"]["Root"]) {
	const { children, open, onOpenChange, position, ...rest } = props;

	assertEmpty(rest);

	return (
		<MantinePopover
			middlewares={{ size: { padding: 20 } }}
			withinPortal
			opened={open}
			onChange={onOpenChange}
			position={position}
			zIndex={10_050}
		>
			{children}
		</MantinePopover>
	);
}

/**
 * Portal-rendered replacement for BlockNote-Mantine's `ToolbarSelect`.
 *
 * The upstream component hardcodes `withinPortal={false}`, which renders the
 * dropdown inside the floating bubble toolbar. That gets clipped by the
 * toolbar's overflow/positioning context, so dropdowns like "Bullet List"
 * appear to never open. Rendering into a portal with a high z-index avoids
 * the clipping while keeping focus and dismissal behaviour intact.
 */
const PortalToolbarSelect = forwardRef<
	HTMLDivElement,
	ComponentProps["FormattingToolbar"]["Select"]
>((props, ref) => {
	const { className, items, isDisabled, ...rest } = props;

	assertEmpty(rest);

	const selectedItem = items.find((item) => item.isSelected);

	if (!selectedItem) {
		return null;
	}

	return (
		<MantineMenu
			withinPortal
			zIndex={10_050}
			transitionProps={{ exitDuration: 0 }}
			disabled={isDisabled}
			middlewares={{ flip: true, shift: true, inline: false, size: true }}
		>
			<MantineMenu.Target>
				<MantineButton
					onMouseDown={(event) => {
						if (isSafari()) {
							(event.currentTarget as HTMLButtonElement).focus();
						}
					}}
					leftSection={selectedItem.icon}
					rightSection={<ChevronDown size={14} />}
					size="xs"
					variant="subtle"
					disabled={isDisabled}
				>
					{selectedItem.text}
				</MantineButton>
			</MantineMenu.Target>
			<MantineMenu.Dropdown className={className} ref={ref}>
				{items.map((item) => (
					<MantineMenu.Item
						key={item.text}
						onClick={item.onClick}
						leftSection={item.icon}
						rightSection={
							item.isSelected ? (
								<MantineCheckIcon size={10} className="bn-tick-icon" />
							) : (
								<div className="bn-tick-space" />
							)
						}
						disabled={item.isDisabled}
					>
						{item.text}
					</MantineMenu.Item>
				))}
			</MantineMenu.Dropdown>
		</MantineMenu>
	);
});

PortalToolbarSelect.displayName = "PortalToolbarSelect";

export const portalBlockNoteComponents = {
	...baseComponents,
	FormattingToolbar: {
		...baseComponents.FormattingToolbar,
		Select: PortalToolbarSelect as typeof baseComponents.FormattingToolbar.Select,
	},
	LinkToolbar: {
		...baseComponents.LinkToolbar,
		Select: PortalToolbarSelect as typeof baseComponents.LinkToolbar.Select,
	},
	Generic: {
		...baseComponents.Generic,
		Menu: {
			...baseComponents.Generic.Menu,
			Root: PortalMenuRoot as typeof baseComponents.Generic.Menu.Root,
		},
		Popover: {
			...baseComponents.Generic.Popover,
			Root: PortalPopoverRoot as typeof baseComponents.Generic.Popover.Root,
		},
		Toolbar: {
			...baseComponents.Generic.Toolbar,
			Select: PortalToolbarSelect as typeof baseComponents.Generic.Toolbar.Select,
		},
	},
} satisfies typeof baseComponents;
