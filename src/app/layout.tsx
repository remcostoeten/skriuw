import type { Metadata, Viewport } from "next";
// auth-drawer's prebuilt CSS re-declares Tailwind utilities (`.hidden`, …) in
// the `utilities` layer. It must enter the cascade BEFORE our own Tailwind
// output, or its `.hidden` outranks our responsive `md:flex`/`md:block` and
// kills every `hidden md:*` element (e.g. the desktop icon rail). The package
// dedupes this import against its own side-effect import, keeping it early.
import "@remcostoeten/auth-drawer/styles.css";
import "@/app/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { AnalyticsGate } from "@/core/analytics/analytics-gate";

export const metadata: Metadata = {
	metadataBase: new URL("https://skriuw.com"),
	title: {
		default: "Skriuw",
		template: "%s | Skriuw",
	},
	description:
		"A calm, keyboard-first notes and journal app with account-backed sync across web and mobile.",
	applicationName: "Skriuw",
	manifest: "/manifest.json",
	keywords: ["Skriuw", "notes", "journal", "writing", "knowledge base", "cloud sync"],
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
		},
	},
	icons: {
		icon: [
			{ url: "/favicon.ico" },
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
		],
		apple: [{ url: "/apple-touch-icon.png" }],
	},
	openGraph: {
		title: "Skriuw",
		description: "A calm notes and journal app with account-backed sync across web and mobile.",
		url: "/",
		siteName: "Skriuw",
		type: "website",
		images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Skriuw" }],
	},
	twitter: {
		card: "summary_large_image",
		title: "Skriuw",
		description: "A calm notes and journal app with account-backed sync across web and mobile.",
		images: ["/opengraph-image"],
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f5f2eb" },
		{ media: "(prefers-color-scheme: dark)", color: "#121212" },
	],
};

type Props = {
	children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var raw=localStorage.getItem("preferences-store");if(!raw)return;var parsed=JSON.parse(raw);var theme=parsed&&parsed.state&&parsed.state.appearance&&parsed.state.appearance.theme;if(theme){document.documentElement.setAttribute("data-theme",theme);}}catch(e){}})();`,
					}}
				/>
			</head>
			<body className="font-sans">
				{children}
				<div id="auth-drawer-portal" />
				<AnalyticsGate />
				<Analytics />
			</body>
		</html>
	);
}
