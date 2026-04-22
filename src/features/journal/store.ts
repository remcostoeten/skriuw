import { create } from "zustand";

type JournalUiState = {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  resetWorkspace: () => void;
};

export const useJournalStore = create<JournalUiState>()((set) => ({
  selectedDate: new Date(),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  resetWorkspace: () => set({ selectedDate: new Date() }),
}));
