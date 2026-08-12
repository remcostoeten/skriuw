"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Tracks the guided product tour.
 *
 * Deliberately browser-scoped (a single localStorage key) rather than per-user:
 * the tour introduces the app, not an account, so once per browser is the right
 * granularity — and it works identically for guests and signed-in users without
 * any server round-trip.
 *
 * `hydrated` flips true once persisted state has loaded, so the UI can avoid
 * flashing the overlay for returning visitors during the first client render.
 * `activeStep` is intentionally not persisted — a reload mid-tour restarts it.
 */
type TourState = {
	hasSeenTour: boolean;
	hydrated: boolean;
	activeStep: number | null;
	startTour: () => void;
	advance: () => void;
	back: () => void;
	dismissTour: () => void;
	/** Re-arms the tour — used by the `settings.productTour` command and QA. */
	resetTour: () => void;
	markHydrated: () => void;
};

export const useTourStore = create<TourState>()(
	persist(
		(set) => ({
			hasSeenTour: false,
			hydrated: false,
			activeStep: null,
			startTour: () => set({ activeStep: 0 }),
			advance: () =>
				set((state) =>
					state.activeStep === null ? state : { activeStep: state.activeStep + 1 },
				),
			back: () =>
				set((state) =>
					state.activeStep === null
						? state
						: { activeStep: Math.max(0, state.activeStep - 1) },
				),
			dismissTour: () => set({ activeStep: null, hasSeenTour: true }),
			resetTour: () => set({ hasSeenTour: false, activeStep: null }),
			markHydrated: () => set({ hydrated: true }),
		}),
		{
			name: "skriuw-tour",
			storage: createJSONStorage(() => globalThis.localStorage),
			partialize: (state) => ({ hasSeenTour: state.hasSeenTour }),
			// The rehydration callback fires synchronously while the exported
			// `useTourStore` const is still in its temporal dead zone, so it
			// must go through the passed state, never the store variable.
			onRehydrateStorage: () => (state) => {
				state?.markHydrated();
			},
		},
	),
);
