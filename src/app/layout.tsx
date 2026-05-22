import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { editorFontVariables } from "@/app/editor-font-loaders";
import { AppProviders } from "@/providers/app-providers";
import { getServerUser } from "@/core/db";
import type { EditorPreferencesRecord } from "@/features/settings/server/queries";

export const metadata: Metadata = {
	metadataBase: new URL("https://skriuw.app"),
	title: {
		default: "Skriuw",
		template: "%s | Skriuw",
	},
	description:
		"A calm, keyboard-first notes and journal app with account-backed sync across web and mobile.",
	applicationName: "Skriuw",
	keywords: ["Skriuw", "notes", "journal", "writing", "knowledge base", "cloud sync"],
	openGraph: {
		title: "Skriuw",
		description: "A calm notes and journal app with account-backed sync across web and mobile.",
		siteName: "Skriuw",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Skriuw",
		description: "A calm notes and journal app with account-backed sync across web and mobile.",
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
};

type Props = {
	children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
	const { user } = await getServerUser();
	const initialEditorPreferences: EditorPreferencesRecord | null = user
		? ((user as { editorPreferences?: EditorPreferencesRecord | null }).editorPreferences ??
				null)
		: null;

	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${editorFontVariables} font-sans`}>
				<AppProviders initialEditorPreferences={initialEditorPreferences}>
					{children}
				</AppProviders>
			</body>
		</html>
	);
}
