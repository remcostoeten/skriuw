import "../styles/globals.css";
import "../styles/outlines-accessibility.css";
import { Providers } from "./providers";
import { CommandExecutor } from "@/components/command-executor";
import { InstallController } from "@/modules/install";
import type { Metadata } from "next";
import "prismjs/themes/prism-tomorrow.css";

// Force dynamic rendering to avoid SSR issues with BlockNote
export const dynamic = 'force-dynamic'

export const viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: 'white' },
		{ media: '(prefers-color-scheme: dark)', color: '#0a0a0a' }
	],
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	viewportFit: 'cover'
}

export const metadata: Metadata = {
	title: 'Skriuw',
	description: 'A blazingly fast, privacy-focused note-taking app',
	manifest: '/manifest.json',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Skriuw'
	},
	icons: {
		icon: [
			{ url: '/favicon.svg', media: '(prefers-color-scheme: light)' },
			{ url: '/favicon-dark.svg', media: '(prefers-color-scheme: dark)' }
		],
		apple: [
			{
				url: '/apple-touch-icon.png',
				sizes: '180x180',
				type: 'image/png'
			}
		]
	},
	other: {
		'msapplication-TileImage': '/ms-application.png',
		'msapplication-TileColor': '#000000'
	}
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang='en' suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `
							(function() {
								document.documentElement.classList.add('dark');
								document.documentElement.style.backgroundColor = 'hsl(0 0% 7%)';
							})();
						`
					}}
				/>
			</head>
			<body className='font-sans antialiased dark bg-background overscroll-none' suppressHydrationWarning>
				<div id='main-content' className='h-safe-screen w-full pb-safe pt-safe'>
					<Providers>
						{children}
						<CommandExecutor />
						<InstallController />
					</Providers>
				</div>
			</body>
		</html>
	)
}
