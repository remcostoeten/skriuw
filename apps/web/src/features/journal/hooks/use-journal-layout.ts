"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSameDay, parseISO, isValid } from "date-fns";
import { useReducedMotion, type Transition } from "framer-motion";
import { useShortcutManager } from "@/core/shortcuts";
import { useActiveCommandScope, useRegisterCommands, useCommandRegistry } from "@/core/commands";
import { focusActiveEditor } from "@/shared/lib/focus-editor";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { openSettings, toggleSettings } from "@/features/settings/use-settings-modal";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import { useJournalEntries } from "./use-journal-entries";
import { useJournalTags } from "./use-journal-tags";

export type JournalView = "list" | "editor";
export type JournalEditorMode = "plain" | "rich";

type UseJournalLayoutResult = {
	selectedDate: Date;
	sidebarWidth: number;
	showSidebar: boolean;
	setShowSidebar: Dispatch<SetStateAction<boolean>>;
	showCommandPalette: boolean;
	setShowCommandPalette: (open: boolean) => void;
	showShortcutHelp: boolean;
	setShowShortcutHelp: Dispatch<SetStateAction<boolean>>;
	editorMode: JournalEditorMode;
	view: JournalView;
	isHydrated: boolean;
	isMobile: boolean;
	prefersReducedMotion: boolean;
	overlayTransition: Transition;
	sidebarTransition: Transition;
	shortcutGroups: ShortcutHelpGroup[];
	handleSelectEntry: (dateKey: string) => void;
	handleSelectDate: (date: Date) => void;
	handleToggleSidebar: () => void;
	handleNewEntry: () => void;
	handleBackToList: () => void;
	handleOpenSettings: () => void;
	handleToggleEditorMode: () => void;
	handleGoToToday: () => void;
	handleOpenCommandPalette: () => void;
	handleOpenShortcutHelp: () => void;
	handleGoToNotes: () => void;
	closeSidebar: () => void;
};

function parseDateParam(value: string | null): Date | null {
	if (!value) return null;

	const parsedDate = parseISO(value);
	return isValid(parsedDate) ? parsedDate : null;
}

export function useJournalLayout(): UseJournalLayoutResult {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { getHelpGroups } = useShortcutManager();
	const {
		isOpen: showCommandPalette,
		setIsOpen: setShowCommandPalette,
		toggleOpen: handleOpenCommandPalette,
	} = useCommandRegistry();

	const entriesQuery = useJournalEntries();
	const tagsQuery = useJournalTags();
	const dateParam = searchParams.get("date");
	const ui = useNotesStore((state) => state.ui);
	const setUIState = useNotesStore((state) => state.setUIState);
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [showSidebar, setShowSidebar] = useState(true);
	const [showShortcutHelp, setShowShortcutHelp] = useState(false);
	const [editorMode, setEditorMode] = useState<JournalEditorMode>("rich");
	const [view, setView] = useState<JournalView>("list");
	const prefersReducedMotion = Boolean(useReducedMotion());
	const { isMobile, sidebarWidth } = ui;
	const isHydrated = entriesQuery.isSuccess && tagsQuery.isSuccess;

	useEffect(() => {
		const requestedDate = parseDateParam(dateParam);
		if (!requestedDate) return;

		setSelectedDate((current) => (isSameDay(current, requestedDate) ? current : requestedDate));
		setView((current) => (current === "editor" ? current : "editor"));
	}, [dateParam]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 767px)");
		const syncViewport = (event?: MediaQueryListEvent) => {
			const mobile = event?.matches ?? mediaQuery.matches;
			setUIState({ isMobile: mobile });
			setShowSidebar(!mobile);
		};

		syncViewport();
		mediaQuery.addEventListener("change", syncViewport);

		return () => mediaQuery.removeEventListener("change", syncViewport);
	}, [setUIState]);

	const selectDate = useCallback(
		(date: Date) => {
			setSelectedDate(date);
			setView("editor");
			if (isMobile) setShowSidebar(false);
		},
		[isMobile],
	);

	const handleSelectEntry = useCallback(
		(dateKey: string) => {
			triggerNativeFeedback("selection");
			const [year, month, day] = dateKey.split("-").map(Number);
			selectDate(new Date(year, month - 1, day));
		},
		[selectDate],
	);

	const handleSelectDate = useCallback(
		(date: Date) => {
			triggerNativeFeedback("selection");
			selectDate(date);
		},
		[selectDate],
	);

	const handleToggleSidebar = useCallback(() => {
		setShowSidebar((current) => {
			triggerNativeFeedback(current ? "dismiss" : "selection");
			return !current;
		});
	}, []);

	const handleNewEntry = useCallback(() => {
		triggerNativeFeedback("success");
		selectDate(new Date());
	}, [selectDate]);

	const handleBackToList = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setView("list");
	}, []);

	const handleOpenSettings = useCallback(() => {
		triggerNativeFeedback("selection");
		openSettings();
	}, []);

	const handleToggleEditorMode = useCallback(() => {
		triggerNativeFeedback("impact");
		setEditorMode((current) => (current === "plain" ? "rich" : "plain"));
	}, []);

	const handleGoToToday = useCallback(() => {
		triggerNativeFeedback("selection");
		selectDate(new Date());
	}, [selectDate]);

	const handleOpenShortcutHelp = useCallback(() => {
		triggerNativeFeedback("selection");
		setShowShortcutHelp(true);
	}, []);

	const handleGoToNotes = useCallback(() => {
		triggerNativeFeedback("selection");
		router.push("/");
	}, [router]);

	const closeSidebar = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setShowSidebar(false);
	}, []);

	const overlayTransition = useMemo<Transition>(
		() =>
			prefersReducedMotion
				? { duration: 0.12, ease: "linear" }
				: { duration: 0.2, ease: "easeOut" },
		[prefersReducedMotion],
	);

	const sidebarTransition = useMemo<Transition>(
		() =>
			prefersReducedMotion
				? { duration: 0.16, ease: "easeOut" }
				: { duration: 0.46, ease: [0.32, 0.72, 0, 1] },
		[prefersReducedMotion],
	);

	// Register journal commands and scope
	useActiveCommandScope("journal");

	useRegisterCommands({
		"journal.goToToday": handleGoToToday,
		"journal.toggleSidebar": handleToggleSidebar,
		"journal.backToList": handleBackToList,
		"journal.toggleEditor": handleToggleEditorMode,
		"journal.focusEditor": () => focusActiveEditor(),
		"journal.help": handleOpenShortcutHelp,
	});

	const shortcutGroups = getHelpGroups(["journal"]);

	return {
		selectedDate,
		sidebarWidth,
		showSidebar,
		setShowSidebar,
		showCommandPalette,
		setShowCommandPalette,
		showShortcutHelp,
		setShowShortcutHelp,
		editorMode,
		view,
		isHydrated,
		isMobile,
		prefersReducedMotion,
		overlayTransition,
		sidebarTransition,
		shortcutGroups,
		handleSelectEntry,
		handleSelectDate,
		handleToggleSidebar,
		handleNewEntry,
		handleBackToList,
		handleOpenSettings,
		handleToggleEditorMode,
		handleGoToToday,
		handleOpenCommandPalette,
		handleOpenShortcutHelp,
		handleGoToNotes,
		closeSidebar,
	};
}
