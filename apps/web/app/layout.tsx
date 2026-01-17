import type { Metadata } from 'next'
import '../styles/globals.css'
import '../styles/outlines-accessibility.css'
import 'prismjs/themes/prism-tomorrow.css'

import { Providers } from './providers'
import { CommandExecutor } from '@/components/command-executor'
import { InstallPrompt } from '@/components/pwa/install-prompt'

// Force dynamic rendering to avoid SSR issues with BlockNote
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Skriuw',
	description: 'A blazingly fast, privacy-focused note-taking app',
	manifest: '/manifest.json',
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
	appleWebApp: {
		capable: true,
		statusBarStyle: 'default',
		title: 'Skriuw'
	},
	other: {
		'msapplication-TileImage': '/ms-application.png',
		'msapplication-TileColor': '#000000'
	}
}

export default function RootLayout({
	children
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className="font-sans antialiased dark bg-background"
				suppressHydrationWarning
			>
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
				<div id="main-content">
					<Providers>
						{children}
						<CommandExecutor />
						<InstallPrompt />
					</Providers>
				</div>
			</body>
		</html>
	)
}
