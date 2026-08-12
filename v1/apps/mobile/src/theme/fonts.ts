import { Platform } from "react-native";

/** Font families matching the web design tokens (globals.css --font-sans /
 *  --font-mono). Sans resolves to the platform system UI font (RN's default,
 *  hence undefined); mono maps web's `ui-monospace, SFMono-Regular, …, Menlo,
 *  monospace` stack to each platform's system monospace. No custom font is
 *  bundled, so nothing has to be loaded at startup. */
export const fonts = {
	sans: undefined as string | undefined,
	mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
} as const;
