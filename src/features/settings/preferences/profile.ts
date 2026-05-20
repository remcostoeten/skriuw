import { isAiModelId } from "@/domain/ai/constants";
import { isEditorFontId } from "@/shared/lib/editor-fonts";
import { isEditorLineHeight } from "@/features/editor/lib/editor-line-height";
import { getUserEditorPreferences } from "@/features/settings/lib/editor-preferences";
import { createDefaultProfile } from "./defaults";
import { isAccentId, isThemeId } from "./themes";
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

function normalizeAi(
	rawAi: Record<string, unknown> | undefined,
	fallback: PreferencesProfile["ai"],
): PreferencesProfile["ai"] {
	const model =
		typeof rawAi?.model === "string" && isAiModelId(rawAi.model) ? rawAi.model : fallback.model;

	// Migrate legacy single apiKey → keys array
	if (!Array.isArray(rawAi?.keys) && typeof rawAi?.apiKey === "string" && rawAi.apiKey) {
		const migratedKey: AiKey = {
			id: "migrated-key",
			name: "Default",
			apiKey: rawAi.apiKey as string,
			tested: true,
		};
		return { model, keys: [migratedKey], activeKeyId: "migrated-key" };
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

	return { model, keys, activeKeyId };
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
			spellcheck: normalizeBoolean(profile?.editor?.spellcheck, fallback.editor.spellcheck),
			smartPunctuation: normalizeBoolean(
				profile?.editor?.smartPunctuation,
				fallback.editor.smartPunctuation,
			),
			markdownShortcuts: normalizeBoolean(
				profile?.editor?.markdownShortcuts,
				fallback.editor.markdownShortcuts,
			),
		},
		appearance: {
			theme: isThemeId(profile?.appearance?.theme)
				? profile.appearance.theme
				: fallback.appearance.theme,
			accentColor: isAccentId(profile?.appearance?.accentColor)
				? profile.appearance.accentColor
				: fallback.appearance.accentColor,
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
		},
		notifications: {
			dailyReminder: normalizeBoolean(
				profile?.notifications?.dailyReminder,
				fallback.notifications.dailyReminder,
			),
			weeklyReview: normalizeBoolean(
				profile?.notifications?.weeklyReview,
				fallback.notifications.weeklyReview,
			),
			mentions: normalizeBoolean(
				profile?.notifications?.mentions,
				fallback.notifications.mentions,
			),
			emailSummaries: normalizeBoolean(
				profile?.notifications?.emailSummaries,
				fallback.notifications.emailSummaries,
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
						.map((item) => ({
							mood: typeof item?.mood === "string" ? item.mood : "",
							date: toDate(item?.date),
						}))
						.filter((item) => item.mood.length > 0)
						.slice(0, MAX_RECENT_MOODS)
				: fallback.journal.recentMoods,
		},
		ai: normalizeAi(profile?.ai as Record<string, unknown> | undefined, fallback.ai),
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
