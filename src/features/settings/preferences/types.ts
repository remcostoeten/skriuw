import type { EditorFontId } from "@/shared/lib/editor-fonts";
import type { EditorLineHeight } from "@/features/editor/lib/editor-line-height";
import type { ThemeId } from "./themes";

export type ActivityAction = "settings_opened" | "note_created" | "mode_changed" | "diary_toggled";

export type ActivityItem = {
	id: string;
	action: ActivityAction;
	createdAt: Date;
};

export interface EditorPreferences {
	defaultModeRaw: boolean;
	defaultPlaceholder: string;
	defaultFont: EditorFontId;
	lineHeight: EditorLineHeight;
	animateNumbers: boolean;
}

export interface AppearancePreferences {
	theme: ThemeId;
	compactSidebar: boolean;
	showLineNumbers: boolean;
	reduceMotion: boolean;
}

export interface ProfilePreferences {
	avatarColor: string | null;
}

export interface JournalPreferences {
	diaryModeEnabled: boolean;
	recentMoods: Array<{ mood: string; date: Date }>;
}

export interface AiKey {
	id: string;
	name: string;
	apiKey: string;
	tested: boolean;
}

export interface AiPreferences {
	model: string;
	keys: AiKey[];
	activeKeyId: string | null;
}

export type PreferencesProfile = {
	editor: EditorPreferences;
	appearance: AppearancePreferences;
	profile: ProfilePreferences;
	journal: JournalPreferences;
	ai: AiPreferences;
	amountOfNotes: number;
	activity: ActivityItem[];
};

export type PersistedPreferencesProfile = {
	editor?: Partial<EditorPreferences>;
	appearance?: Partial<AppearancePreferences>;
	profile?: Partial<ProfilePreferences>;
	journal?: Partial<JournalPreferences>;
	ai?: Partial<AiPreferences>;
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
