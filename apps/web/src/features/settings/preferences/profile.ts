import { isAiModelId } from "@/domain/ai/constants";
import { isGotoIndicatorPosition, isGotoIndicatorSize } from "@/core/quick-access/goto-types";
import { parseDurationMs } from "@/core/quick-access/parse-duration";
import { isEditorFontId } from "@/shared/lib/editor-fonts";
import { isEditorLineHeight } from "@/features/editor/lib/editor-line-height";
import {
	NOTE_PROPERTY_TEMPLATES,
	normalizeCustomNotePropertyTemplates,
} from "@/domain/notes/properties";
import { getUserEditorPreferences } from "@/features/settings/lib/editor-preferences";
import { createDefaultProfile } from "./defaults";
import { isThemeId } from "./themes";
import type {
	ActivityAction,
	ActivityItem,
	AiKey,
	PersistedPreferencesProfile,
	PreferencesProfile,
} from "./types";

const MAX_RECENT_MOODS = 30;
const MAX_ACTIVITY_ITEMS = 50;

function toDate(value: unknown, fallback = new Date()): Date {
	if (value instanceof Date) {
		return value;
	}

	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date;
		}
	}

	return fallback;
}

function normalizeBoolean<T extends boolean>(value: unknown, fallback: T): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function normalizeString<T extends string>(value: unknown, fallback: T): string {
	return typeof value === "string" ? value : fallback;
}

function normalizeNotePropertiesLayout(
	value: unknown,
	fallback: PreferencesProfile["editor"]["notePropertiesLayout"],
): PreferencesProfile["editor"]["notePropertiesLayout"] {
	return value === "rows" || value === "inline" ? value : fallback;
}

function normalizeNotePropertiesDefaultTemplateId(value: unknown): string | null {
	if (value === null || value === undefined || value === "") return null;
	return typeof value === "string" &&
		NOTE_PROPERTY_TEMPLATES.some((template) => template.id === value)
		? value
		: null;
}

function normalizeAi(
	rawAi: Record<string, unknown> | undefined,
	fallback: PreferencesProfile["ai"],
): PreferencesProfile["ai"] {
	const model =
		typeof rawAi?.model === "string" && isAiModelId(rawAi.model) ? rawAi.model : fallback.model;
	const translateLanguage =
		typeof rawAi?.translateLanguage === "string" && rawAi.translateLanguage.trim()
			? rawAi.translateLanguage
			: fallback.translateLanguage;

	// Migrate legacy single apiKey → keys array
	if (!Array.isArray(rawAi?.keys) && typeof rawAi?.apiKey === "string" && rawAi.apiKey) {
		const migratedKey: AiKey = {
			id: "migrated-key",
			name: "Default",
			apiKey: rawAi.apiKey as string,
			tested: true,
		};
		return { model, keys: [migratedKey], activeKeyId: "migrated-key", translateLanguage };
	}

	const keys: AiKey[] = Array.isArray(rawAi?.keys)
		? (rawAi.keys as unknown[])
				.filter(
					(k): k is AiKey =>
						typeof (k as AiKey)?.id === "string" &&
						typeof (k as AiKey)?.apiKey === "string" &&
						typeof (k as AiKey)?.name === "string",
				)
				.map((k) => ({ ...k, tested: Boolean(k.tested) }))
		: [];

	const activeKeyId =
		typeof rawAi?.activeKeyId === "string" && keys.some((k) => k.id === rawAi.activeKeyId)
			? (rawAi.activeKeyId as string)
			: (keys[0]?.id ?? null);

	return { model, keys, activeKeyId, translateLanguage };
}

export function normalizeProfile(
	profile: PersistedPreferencesProfile | undefined,
): PreferencesProfile {
	const fallback = createDefaultProfile();

	return {
		editor: {
			defaultModeRaw: normalizeBoolean(
				profile?.editor?.defaultModeRaw,
				fallback.editor.defaultModeRaw,
			),
			vimMode: normalizeBoolean(profile?.editor?.vimMode, fallback.editor.vimMode),
			defaultPlaceholder: normalizeString(
				profile?.editor?.defaultPlaceholder,
				fallback.editor.defaultPlaceholder,
			),
			defaultFont:
				typeof profile?.editor?.defaultFont === "string" &&
				isEditorFontId(profile.editor.defaultFont)
					? profile.editor.defaultFont
					: fallback.editor.defaultFont,
			lineHeight:
				typeof profile?.editor?.lineHeight === "string" &&
				isEditorLineHeight(profile.editor.lineHeight)
					? profile.editor.lineHeight
					: fallback.editor.lineHeight,
			animateNumbers: normalizeBoolean(
				profile?.editor?.animateNumbers,
				fallback.editor.animateNumbers,
			),
			openNotesInTabs: normalizeBoolean(
				profile?.editor?.openNotesInTabs,
				fallback.editor.openNotesInTabs,
			),
			detectTagsInText: normalizeBoolean(
				profile?.editor?.detectTagsInText,
				fallback.editor.detectTagsInText,
			),
			notePropertiesLayout: normalizeNotePropertiesLayout(
				profile?.editor?.notePropertiesLayout,
				fallback.editor.notePropertiesLayout,
			),
			notePropertiesCollapsed: normalizeBoolean(
				profile?.editor?.notePropertiesCollapsed,
				fallback.editor.notePropertiesCollapsed,
			),
			notePropertiesDefaultTemplateId: normalizeNotePropertiesDefaultTemplateId(
				profile?.editor?.notePropertiesDefaultTemplateId,
			),
			customNotePropertyTemplates: normalizeCustomNotePropertyTemplates(
				profile?.editor?.customNotePropertyTemplates,
			),
		},
		appearance: {
			theme: isThemeId(profile?.appearance?.theme)
				? profile.appearance.theme
				: fallback.appearance.theme,
			compactSidebar: normalizeBoolean(
				profile?.appearance?.compactSidebar,
				fallback.appearance.compactSidebar,
			),
			showLineNumbers: normalizeBoolean(
				profile?.appearance?.showLineNumbers,
				fallback.appearance.showLineNumbers,
			),
			reduceMotion: normalizeBoolean(
				profile?.appearance?.reduceMotion,
				fallback.appearance.reduceMotion,
			),
			rememberLastTab: normalizeBoolean(
				profile?.appearance?.rememberLastTab,
				fallback.appearance.rememberLastTab,
			),
			rememberLastNote: normalizeBoolean(
				profile?.appearance?.rememberLastNote,
				fallback.appearance.rememberLastNote,
			),
			showAnimatedIcons: normalizeBoolean(
				profile?.appearance?.showAnimatedIcons,
				fallback.appearance.showAnimatedIcons,
			),
			showPageIcons: normalizeBoolean(
				profile?.appearance?.showPageIcons,
				fallback.appearance.showPageIcons,
			),
		},
		profile: {
			avatarColor:
				typeof profile?.profile?.avatarColor === "string" ||
				profile?.profile?.avatarColor === null
					? (profile?.profile?.avatarColor ?? fallback.profile.avatarColor)
					: fallback.profile.avatarColor,
		},
		journal: {
			diaryModeEnabled: normalizeBoolean(
				profile?.journal?.diaryModeEnabled,
				fallback.journal.diaryModeEnabled,
			),
			recentMoods: Array.isArray(profile?.journal?.recentMoods)
				? profile.journal.recentMoods
						.flatMap((item) => {
							const mood = typeof item?.mood === "string" ? item.mood : "";
							return mood.length > 0 ? [{ mood, date: toDate(item?.date) }] : [];
						})
						.slice(0, MAX_RECENT_MOODS)
				: fallback.journal.recentMoods,
		},
		privacy: {
			analyticsEnabled: normalizeBoolean(
				profile?.privacy?.analyticsEnabled,
				fallback.privacy.analyticsEnabled,
			),
		},
		ai: normalizeAi(profile?.ai as Record<string, unknown> | undefined, fallback.ai),
		quickAccess: {
			enabled: normalizeBoolean(profile?.quickAccess?.enabled, fallback.quickAccess.enabled),
			allowInEditor: normalizeBoolean(
				profile?.quickAccess?.allowInEditor,
				fallback.quickAccess.allowInEditor,
			),
			gotoModeDuration:
				typeof profile?.quickAccess?.gotoModeDuration === "string" &&
				parseDurationMs(profile.quickAccess.gotoModeDuration) !== null
					? profile.quickAccess.gotoModeDuration
					: fallback.quickAccess.gotoModeDuration,
			showIndicators: normalizeBoolean(
				profile?.quickAccess?.showIndicators,
				fallback.quickAccess.showIndicators,
			),
			indicatorPosition: isGotoIndicatorPosition(profile?.quickAccess?.indicatorPosition)
				? profile.quickAccess.indicatorPosition
				: fallback.quickAccess.indicatorPosition,
			indicatorSize: isGotoIndicatorSize(profile?.quickAccess?.indicatorSize)
				? profile.quickAccess.indicatorSize
				: fallback.quickAccess.indicatorSize,
			indicatorOpacity:
				typeof profile?.quickAccess?.indicatorOpacity === "number" &&
				profile.quickAccess.indicatorOpacity >= 0.1 &&
				profile.quickAccess.indicatorOpacity <= 1
					? profile.quickAccess.indicatorOpacity
					: fallback.quickAccess.indicatorOpacity,
		},
		amountOfNotes:
			typeof profile?.amountOfNotes === "number" && Number.isFinite(profile.amountOfNotes)
				? profile.amountOfNotes
				: fallback.amountOfNotes,
		activity: Array.isArray(profile?.activity)
			? profile.activity
					.map((item) => ({
						id: typeof item?.id === "string" ? item.id : crypto.randomUUID(),
						action: (item?.action as ActivityAction | undefined) ?? "settings_opened",
						createdAt: toDate(item?.createdAt),
					}))
					.slice(0, MAX_ACTIVITY_ITEMS)
			: fallback.activity,
	};
}

export function createActivityItem(action: ActivityAction): ActivityItem {
	return {
		id: crypto.randomUUID(),
		action,
		createdAt: new Date(),
	};
}

export function applyAuthEditorPreferences(profile: PreferencesProfile): PreferencesProfile {
	const authPreferences = getUserEditorPreferences();
	if (!authPreferences?.defaultFont) {
		return profile;
	}

	return {
		...profile,
		editor: {
			...profile.editor,
			defaultFont: authPreferences.defaultFont,
		},
	};
}

export { MAX_ACTIVITY_ITEMS, MAX_RECENT_MOODS };
