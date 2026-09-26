import { create } from "zustand";

type GotoModeState = {
	active: boolean;
	buffer: string;
	/** Destination ids that survived validation for the current activation. */
	activeIds: ReadonlySet<string>;
};

export const useGotoMode = create<GotoModeState>(() => ({
	active: false,
	buffer: "",
	activeIds: new Set(),
}));

export function enterGotoMode(activeIds: ReadonlySet<string>): void {
	useGotoMode.setState({ active: true, buffer: "", activeIds });
}

export function exitGotoMode(): void {
	useGotoMode.setState({ active: false, buffer: "", activeIds: new Set() });
}

export function setGotoBuffer(buffer: string): void {
	useGotoMode.setState({ buffer });
}
