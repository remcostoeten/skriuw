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
import { PwaSetup } from "@/core/pwa/pwa-setup";
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
	appleWebApp: {
		capable: true,
		title: "Skriuw",
		statusBarStyle: "black-translucent",
	},
	icons: {
		icon: [
			{ url: "/favicon.ico" },
			// Dark tile for light UI chrome, light tile for dark UI chrome.
			{
				url: "/favicon-32x32.png",
				sizes: "32x32",
				type: "image/png",
				media: "(prefers-color-scheme: light)",
			},
			{
				url: "/favicon-32x32-light.png",
				sizes: "32x32",
				type: "image/png",
				media: "(prefers-color-scheme: dark)",
			},
			{
				url: "/favicon-16x16.png",
				sizes: "16x16",
				type: "image/png",
				media: "(prefers-color-scheme: light)",
			},
			{
				url: "/favicon-16x16-light.png",
				sizes: "16x16",
				type: "image/png",
				media: "(prefers-color-scheme: dark)",
			},
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

// `themeColor` is intentionally NOT declared here. The app has seven
// `data-theme` themes that are independent of the OS `prefers-color-scheme`,
// so a static media-scoped pair would tint the mobile address bar / Android
// PWA status bar wrong. `ThemeAttribute` owns a single `<meta name="theme-color">`
// (seeded in <head> below) and keeps it matched to the active theme.
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

type Props = {
	children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* Pre-paint: apply the saved theme and seed a `theme-color` meta.
				    The meta is created imperatively (not via JSX) so React never
				    reconciles its content — ThemeAttribute updates it in place to
				    the active theme's real background once hydrated. */}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem("skriuw-active-theme");if(t){document.documentElement.setAttribute("data-theme",t);}var m=document.createElement("meta");m.setAttribute("name","theme-color");m.setAttribute("content","#121212");document.head.appendChild(m);}catch(e){}})();`,
					}}
				/>
			</head>
			<body className="font-sans">
				{children}
				<div id="auth-drawer-portal" />
				<PwaSetup />
				<AnalyticsGate />
				<Analytics />
			</body>
		</html>
	);
}
