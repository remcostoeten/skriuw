// Theme context: exposes the active theme's resolved tokens plus a setter that
// persists the choice, so the native app themes like the web app does (and the
// selection survives restarts).
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_THEME, themes, type TThemeName, type TTheme } from "@/theme/tokens";

const STORAGE_KEY = "skriuw.theme";

type TThemeContext = {
	theme: TTheme;
	name: TThemeName;
	setTheme: (name: TThemeName) => void;
};

const ThemeContext = createContext<TThemeContext | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [name, setName] = useState<TThemeName>(DEFAULT_THEME);

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
			if (active && stored && stored in themes) {
				setName(stored as TThemeName);
			}
		});
		return () => {
			active = false;
		};
	}, []);

	const value = useMemo<TThemeContext>(
		() => ({
			theme: themes[name],
			name,
			setTheme: (next) => {
				setName(next);
				AsyncStorage.setItem(STORAGE_KEY, next);
			},
		}),
		[name],
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): TThemeContext {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
	return ctx;
}
