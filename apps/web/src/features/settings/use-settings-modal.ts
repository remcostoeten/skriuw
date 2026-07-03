import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isSettingsTabVisible, type SettingsTabId } from "./lib/settings-tabs";
import { usePreferencesStore } from "./store";

type SettingsModalState = {
	isOpen: boolean;
	tab: SettingsTabId;
	focusId: string | null;
	open: (tab?: SettingsTabId, focusId?: string) => void;
	close: () => void;
	setTab: (tab: SettingsTabId) => void;
};

function resolveDefaultTab(): SettingsTabId {
	return isSettingsTabVisible("account") ? "account" : "appearance";
}

export const useSettingsModal = create<SettingsModalState>()(
	persist(
		(set, get) => ({
			isOpen: false,
			tab: resolveDefaultTab(),
			focusId: null,
			open: (tab, focusId) => {
				const remember = usePreferencesStore.getState().appearance.rememberLastTab;
				const requested = tab && isSettingsTabVisible(tab) ? tab : null;
				const lastTab = get().tab;
				const remembered = remember && isSettingsTabVisible(lastTab) ? lastTab : null;
				set({
					isOpen: true,
					tab: requested ?? remembered ?? resolveDefaultTab(),
					focusId: focusId ?? null,
				});
			},
			close: () => set({ isOpen: false, focusId: null }),
			setTab: (tab) => set({ tab, focusId: null }),
		}),
		{
			name: "settings-modal",
			storage: createJSONStorage(() => globalThis.localStorage),
			partialize: (state) => ({ tab: state.tab }),
		},
	),
);

/**
 * Imperative entry point for opening the settings modal from non-React call
 * sites (command palette actions, shortcut handlers, etc.). Optionally deep-links
 * to a tab and flashes an individual control by its `data-focus-id`.
 */
export function openSettings(tab?: SettingsTabId, focusId?: string): void {
	useSettingsModal.getState().open(tab, focusId);
}
