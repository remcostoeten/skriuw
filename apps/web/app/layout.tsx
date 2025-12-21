import type { Metadata } from 'next'
import '../styles/globals.css'
import '../styles/outlines-accessibility.css'
import 'prismjs/themes/prism-tomorrow.css'

import { Providers } from './providers'
import { AutoSignIn } from '@/components/auth/auto-sign-in'
import { CommandExecutor } from '@/components/command-executor'

// Force dynamic rendering to avoid SSR issues with BlockNote
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Skriuw',
	description: 'A blazingly fast, privacy-focused note-taking app',
	manifest: '/manifest.json',
	icons: {
		icon: [
			{ url: '/favicon.svg', media: '(prefers-color-scheme: light)' },
			{ url: '/favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
		],
		apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
	},
	other: {
		'msapplication-TileImage': '/ms-application.png',
		'msapplication-TileColor': '#000000',
	},
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `
							(function() {
								// Apply dark theme immediately to prevent flash
								document.documentElement.classList.add('dark');
								// Also set background color inline for immediate effect
								document.documentElement.style.backgroundColor = 'hsl(0 0% 7%)';
							})();
						`,
					}}
				/>
			</head>
			<body className="font-sans antialiased dark bg-background">
				<div id="main-content">
					<Providers>
						<AutoSignIn />
						{children}
						<CommandExecutor />
					</Providers>
				</div>
			</body>
		</html>
	)
}

