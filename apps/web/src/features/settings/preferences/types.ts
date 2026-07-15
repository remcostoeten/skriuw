import type { CustomNotePropertyTemplate } from "@/domain/notes/properties";
import type { EditorFontId } from "@/shared/lib/editor-fonts";
import type { EditorLineHeight } from "@/features/editor/lib/editor-line-height";
import type { GotoIndicatorPosition, GotoIndicatorSize } from "@/core/quick-access/goto-types";
import type { ThemeId } from "./themes";

export type ActivityAction = "settings_opened" | "note_created" | "mode_changed" | "diary_toggled";

export type ActivityItem = {
	id: string;
	action: ActivityAction;
	createdAt: Date;
};

export type EditorPreferences = {
	defaultModeRaw: boolean;
	vimMode: boolean;
	defaultPlaceholder: string;
	defaultFont: EditorFontId;
	lineHeight: EditorLineHeight;
	animateNumbers: boolean;
	openNotesInTabs: boolean;
	detectTagsInText: boolean;
	detectMarksInText: boolean;
	notePropertiesLayout: "rows" | "inline";
	notePropertiesCollapsed: boolean;
	notePropertiesDefaultTemplateId: string | null;
	customNotePropertyTemplates: CustomNotePropertyTemplate[];
};

export type AppearancePreferences = {
	theme: ThemeId;
	compactSidebar: boolean;
	showLineNumbers: boolean;
	reduceMotion: boolean;
	rememberLastTab: boolean;
	rememberLastNote: boolean;
	showAnimatedIcons: boolean;
	showPageIcons: boolean;
};

export type ProfilePreferences = {
	avatarColor: string | null;
};

export type JournalPreferences = {
	diaryModeEnabled: boolean;
	recentMoods: Array<{ mood: string; date: Date }>;
};

export type PrivacyPreferences = {
	analyticsEnabled: boolean;
};

export type AiKey = {
	id: string;
	name: string;
	apiKey: string;
	tested: boolean;
};

export type AiPreferences = {
	model: string;
	semanticProvider: "google" | "ollama";
	semanticModel: string;
	semanticOllamaUrl: string;
	keys: AiKey[];
	activeKeyId: string | null;
	/** Translate-selection target language name; "auto" keeps the EN↔NL heuristic. */
	translateLanguage: string;
};

export type QuickAccessPreferences = {
	enabled: boolean;
	/**
	 * Allow the activation shortcut to fire while typing inside a note. Only
	 * safe with a modifier combo (mod/ctrl/alt+key) — a plain key would toggle
	 * go-to mode on every matching keystroke while writing.
	 */
	allowInEditor: boolean;
	/** Raw user-entered duration string, e.g. "2s" or "1500ms". */
	gotoModeDuration: string;
	showIndicators: boolean;
	indicatorPosition: GotoIndicatorPosition;
	indicatorSize: GotoIndicatorSize;
	indicatorOpacity: number;
};

export type PreferencesProfile = {
	editor: EditorPreferences;
	appearance: AppearancePreferences;
	profile: ProfilePreferences;
	journal: JournalPreferences;
	privacy: PrivacyPreferences;
	ai: AiPreferences;
	quickAccess: QuickAccessPreferences;
	amountOfNotes: number;
	activity: ActivityItem[];
};

export type PersistedPreferencesProfile = {
	editor?: Partial<EditorPreferences>;
	appearance?: Partial<AppearancePreferences>;
	profile?: Partial<ProfilePreferences>;
	journal?: Partial<JournalPreferences>;
	privacy?: Partial<PrivacyPreferences>;
	ai?: Partial<AiPreferences>;
	quickAccess?: Partial<QuickAccessPreferences>;
	amountOfNotes?: number;
	activity?: Array<Partial<ActivityItem>>;
};

export type PersistedPreferencesState = {
	userId?: string | null;
	profiles?: Record<string, PersistedPreferencesProfile>;
	editor?: Partial<EditorPreferences>;
	profile?: Partial<ProfilePreferences>;
	journal?: Partial<JournalPreferences>;
	amountOfNotes?: number;
	activity?: Array<Partial<ActivityItem>>;
};
