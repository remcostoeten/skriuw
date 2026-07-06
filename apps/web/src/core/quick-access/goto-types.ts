export type GotoDestinationType = "focus" | "route" | "open" | "toggle" | "command";

type BaseGotoDestination = {
	/** Globally unique id, e.g. "focus.rightSidebar". */
	id: string;
	type: GotoDestinationType;
	label: string;
};

export type GotoFocusDestination = BaseGotoDestination & {
	type: "focus";
	focusTarget: string;
};

export type GotoRouteDestination = BaseGotoDestination & {
	type: "route";
	path: string;
};

export type GotoDestination = GotoFocusDestination | GotoRouteDestination;

export type GotoTargetConfig = {
	keybind: string;
	to: GotoDestination;
	label?: string;
	enabled?: boolean;
};

export type RegisteredGotoTarget = {
	keybind: string;
	to: GotoDestination;
	label: string;
	element: HTMLElement | null;
};

export const GOTO_INDICATOR_POSITIONS = [
	"top-right",
	"top-left",
	"bottom-right",
	"bottom-left",
] as const;

export type GotoIndicatorPosition = (typeof GOTO_INDICATOR_POSITIONS)[number];

export const GOTO_INDICATOR_SIZES = ["small", "medium", "large"] as const;

export type GotoIndicatorSize = (typeof GOTO_INDICATOR_SIZES)[number];

export function isGotoIndicatorPosition(value: unknown): value is GotoIndicatorPosition {
	return GOTO_INDICATOR_POSITIONS.includes(value as GotoIndicatorPosition);
}

export function isGotoIndicatorSize(value: unknown): value is GotoIndicatorSize {
	return GOTO_INDICATOR_SIZES.includes(value as GotoIndicatorSize);
}
