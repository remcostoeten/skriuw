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
