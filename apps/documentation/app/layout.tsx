import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { site } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	applicationName: "Skriuw Documentation",
	description: site.description,
	icons: {
		apple: "/apple-touch-icon.png",
		icon: "/favicon.ico",
	},
	metadataBase: new URL(site.url),
	openGraph: {
		description: site.description,
		images: [{ url: "/opengraph-preview.png" }],
		siteName: "Skriuw",
		type: "website",
		url: site.url,
	},
	robots: {
		follow: true,
		index: true,
	},
	title: {
		default: "Skriuw Documentation",
		template: "%s | Skriuw Documentation",
	},
	twitter: {
		card: "summary_large_image",
		description: site.description,
		images: ["/opengraph-preview.png"],
		title: "Skriuw Documentation",
	},
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col`}
			>
				<RootProvider>{children}</RootProvider>
			</body>
		</html>
	);
}
