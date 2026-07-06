import { create } from "zustand";

type QuickSwitcherState = {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
};

export const useQuickSwitcher = create<QuickSwitcherState>()((set, get) => ({
	isOpen: false,
	open: () => set({ isOpen: true }),
	close: () => set({ isOpen: false }),
	toggle: () => set({ isOpen: !get().isOpen }),
}));

/**
 * Imperative entry point for opening the quick switcher from non-React call
 * sites (shortcut handlers, command palette actions).
 */
export function openQuickSwitcher(): void {
	useQuickSwitcher.getState().open();
}

export function toggleQuickSwitcher(): void {
	useQuickSwitcher.getState().toggle();
}
