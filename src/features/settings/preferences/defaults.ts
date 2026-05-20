import { DEFAULT_AI_MODEL } from "@/domain/ai/constants";
import type {
	AiPreferences,
	AppearancePreferences,
	EditorPreferences,
	JournalPreferences,
	NotificationsPreferences,
	PreferencesProfile,
	ProfilePreferences,
} from "./types";
import { DEFAULT_ACCENT_ID } from "./themes";

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
	defaultModeRaw: false,
	defaultPlaceholder: "Start writing...",
	defaultFont: "inter",
	lineHeight: "comfortable",
	spellcheck: true,
	smartPunctuation: true,
	markdownShortcuts: true,
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
	theme: "midnight",
	accentColor: DEFAULT_ACCENT_ID,
	compactSidebar: false,
	showLineNumbers: true,
	reduceMotion: false,
};

export const DEFAULT_NOTIFICATIONS_PREFERENCES: NotificationsPreferences = {
	dailyReminder: true,
	weeklyReview: false,
	mentions: true,
	emailSummaries: false,
};

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
	avatarColor: null,
};

export const DEFAULT_JOURNAL_PREFERENCES: JournalPreferences = {
	diaryModeEnabled: false,
	recentMoods: [],
};

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
	model: DEFAULT_AI_MODEL,
	keys: [],
	activeKeyId: null,
};

export function createDefaultProfile(): PreferencesProfile {
	return {
		editor: { ...DEFAULT_EDITOR_PREFERENCES },
		appearance: { ...DEFAULT_APPEARANCE_PREFERENCES },
		notifications: { ...DEFAULT_NOTIFICATIONS_PREFERENCES },
		profile: { ...DEFAULT_PROFILE_PREFERENCES },
		journal: { ...DEFAULT_JOURNAL_PREFERENCES, recentMoods: [] },
		ai: { ...DEFAULT_AI_PREFERENCES },
		amountOfNotes: 0,
		activity: [],
	};
}
