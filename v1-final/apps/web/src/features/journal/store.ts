import { create } from "zustand";

type JournalUiState = {
	selectedDate: Date;
	setSelectedDate: (date: Date) => void;
	resetUi: () => void;
};

export const useJournalStore = create<JournalUiState>()((set) => ({
	selectedDate: new Date(),
	setSelectedDate: (selectedDate) => set({ selectedDate }),
	resetUi: () => set({ selectedDate: new Date() }),
}));
