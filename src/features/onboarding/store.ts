"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Tracks whether the visitor has seen the one-time welcome walkthrough.
 *
 * Deliberately browser-scoped (a single localStorage key) rather than per-user:
 * the walkthrough is an introduction to the app, not to an account, so showing
 * it once per browser is the right granularity — and it works identically for
 * guests and signed-in users without any server round-trip.
 *
 * `hydrated` flips true once persisted state has loaded, so the UI can avoid
 * flashing the overlay for returning visitors during the first client render.
 */
type OnboardingState = {
	hasSeenWelcome: boolean;
	hydrated: boolean;
	dismissWelcome: () => void;
	/** Re-arms the walkthrough — handy from settings or for QA. */
	resetWelcome: () => void;
};

export const useOnboardingStore = create<OnboardingState>()(
	persist(
		(set) => ({
			hasSeenWelcome: false,
			hydrated: false,
			dismissWelcome: () => set({ hasSeenWelcome: true }),
			resetWelcome: () => set({ hasSeenWelcome: false }),
		}),
		{
			name: "skriuw-onboarding",
			storage: createJSONStorage(() => globalThis.localStorage),
			partialize: (state) => ({ hasSeenWelcome: state.hasSeenWelcome }),
			onRehydrateStorage: () => () => {
				useOnboardingStore.setState({ hydrated: true });
			},
		},
	),
);
