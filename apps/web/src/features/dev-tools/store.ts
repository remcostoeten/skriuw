import { create } from "zustand";
import { persist } from "zustand/middleware";

type DevToolsState = {
	forceLoading: boolean;
	setForceLoading: (value: boolean) => void;
	toggleForceLoading: () => void;
};

export const useDevToolsStore = create<DevToolsState>()(
	persist(
		(set, get) => ({
			forceLoading: false,
			setForceLoading: (value) => set({ forceLoading: value }),
			toggleForceLoading: () => set({ forceLoading: !get().forceLoading }),
		}),
		{ name: "skriuw:dev-tools" },
	),
);

export function isDevEnv() {
	return process.env.NODE_ENV === "development";
}
