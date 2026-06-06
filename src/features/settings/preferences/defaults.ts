import { DEFAULT_AI_MODEL } from "@/domain/ai/constants";
import type {
	AiPreferences,
	AppearancePreferences,
	EditorPreferences,
	JournalPreferences,
	PreferencesProfile,
	PrivacyPreferences,
	ProfilePreferences,
} from "./types";

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
	defaultModeRaw: false,
	defaultPlaceholder: "Start writing...",
	defaultFont: "inter",
	lineHeight: "comfortable",
	animateNumbers: true,
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
	theme: "midnight",
	compactSidebar: false,
	showLineNumbers: true,
	reduceMotion: false,
};

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
	avatarColor: null,
};

export const DEFAULT_JOURNAL_PREFERENCES: JournalPreferences = {
	diaryModeEnabled: false,
	recentMoods: [],
};

export const DEFAULT_PRIVACY_PREFERENCES = {
	analyticsEnabled: false,
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
		profile: { ...DEFAULT_PROFILE_PREFERENCES },
		journal: { ...DEFAULT_JOURNAL_PREFERENCES, recentMoods: [] },
		privacy: { ...DEFAULT_PRIVACY_PREFERENCES },
		ai: { ...DEFAULT_AI_PREFERENCES },
		amountOfNotes: 0,
		activity: [],
	};
}
