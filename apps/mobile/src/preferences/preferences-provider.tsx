import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "skriuw.mobile-preferences";

export type EditorFontSize = "small" | "medium" | "large";
export type EditorLineHeight = "compact" | "comfortable" | "relaxed";

type MobilePreferences = {
	editorFontSize: EditorFontSize;
	editorLineHeight: EditorLineHeight;
	spellCheck: boolean;
};

type MobilePreferencesContext = MobilePreferences & {
	setEditorFontSize: (value: EditorFontSize) => void;
	setEditorLineHeight: (value: EditorLineHeight) => void;
	setSpellCheck: (value: boolean) => void;
};

const defaults: MobilePreferences = {
	editorFontSize: "medium",
	editorLineHeight: "comfortable",
	spellCheck: true,
};

const PreferencesContext = createContext<MobilePreferencesContext | null>(null);

function isFontSize(value: unknown): value is EditorFontSize {
	return value === "small" || value === "medium" || value === "large";
}

function isLineHeight(value: unknown): value is EditorLineHeight {
	return value === "compact" || value === "comfortable" || value === "relaxed";
}

export function MobilePreferencesProvider({ children }: { children: ReactNode }) {
	const [preferences, setPreferences] = useState(defaults);

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
			if (!active || !stored) return;
			try {
				const value = JSON.parse(stored) as Partial<MobilePreferences>;
				setPreferences({
					editorFontSize: isFontSize(value.editorFontSize)
						? value.editorFontSize
						: defaults.editorFontSize,
					editorLineHeight: isLineHeight(value.editorLineHeight)
						? value.editorLineHeight
						: defaults.editorLineHeight,
					spellCheck:
						typeof value.spellCheck === "boolean"
							? value.spellCheck
							: defaults.spellCheck,
				});
			} catch {
				// Ignore malformed local preferences and retain safe defaults.
			}
		});
		return () => {
			active = false;
		};
	}, []);

	const update = (patch: Partial<MobilePreferences>) => {
		setPreferences((current) => {
			const next = { ...current, ...patch };
			void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			return next;
		});
	};

	const value = useMemo<MobilePreferencesContext>(
		() => ({
			...preferences,
			setEditorFontSize: (editorFontSize) => update({ editorFontSize }),
			setEditorLineHeight: (editorLineHeight) => update({ editorLineHeight }),
			setSpellCheck: (spellCheck) => update({ spellCheck }),
		}),
		[preferences],
	);

	return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useMobilePreferences() {
	const context = useContext(PreferencesContext);
	if (!context) {
		throw new Error("useMobilePreferences must be used within MobilePreferencesProvider");
	}
	return context;
}
