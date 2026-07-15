/* eslint-disable deslop/unused-export */
import { DEFAULT_AI_MODEL } from "@/domain/ai/constants";
import type {
	AiPreferences,
	AppearancePreferences,
	EditorPreferences,
	JournalPreferences,
	PreferencesProfile,
	PrivacyPreferences,
	ProfilePreferences,
	QuickAccessPreferences,
} from "./types";

const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
	defaultModeRaw: false,
	vimMode: false,
	defaultPlaceholder: "Start writing...",
	defaultFont: "inter",
	lineHeight: "comfortable",
	animateNumbers: true,
	openNotesInTabs: false,
	detectTagsInText: true,
	detectMarksInText: true,
	notePropertiesLayout: "rows",
	notePropertiesCollapsed: false,
	notePropertiesDefaultTemplateId: null,
	customNotePropertyTemplates: [],
};

const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
	theme: "midnight",
	compactSidebar: false,
	showLineNumbers: true,
	reduceMotion: false,
	rememberLastTab: true,
	rememberLastNote: false,
	showAnimatedIcons: true,
	showPageIcons: true,
};

const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
	avatarColor: null,
};

const DEFAULT_JOURNAL_PREFERENCES: JournalPreferences = {
	diaryModeEnabled: false,
	recentMoods: [],
};

const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
	analyticsEnabled: true,
};

const DEFAULT_AI_PREFERENCES: AiPreferences = {
	model: DEFAULT_AI_MODEL,
	semanticProvider: "google",
	semanticModel: "embeddinggemma",
	semanticOllamaUrl: "http://127.0.0.1:11434",
	keys: [],
	activeKeyId: null,
	translateLanguage: "auto",
};

const DEFAULT_QUICK_ACCESS_PREFERENCES: QuickAccessPreferences = {
	enabled: true,
	allowInEditor: false,
	gotoModeDuration: "2s",
	showIndicators: true,
	indicatorPosition: "top-right",
	indicatorSize: "small",
	indicatorOpacity: 0.95,
};

export function createDefaultProfile(): PreferencesProfile {
	return {
		editor: { ...DEFAULT_EDITOR_PREFERENCES },
		appearance: { ...DEFAULT_APPEARANCE_PREFERENCES },
		profile: { ...DEFAULT_PROFILE_PREFERENCES },
		journal: { ...DEFAULT_JOURNAL_PREFERENCES, recentMoods: [] },
		privacy: { ...DEFAULT_PRIVACY_PREFERENCES },
		ai: { ...DEFAULT_AI_PREFERENCES },
		quickAccess: { ...DEFAULT_QUICK_ACCESS_PREFERENCES },
		amountOfNotes: 0,
		activity: [],
	};
}
