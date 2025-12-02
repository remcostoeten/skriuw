import type { Metadata } from 'next'
import '@/styles/globals.css'
import '@/styles/outlines-accessibility.css'
import 'prismjs/themes/prism-tomorrow.css'

import { Providers } from './providers'

export const metadata: Metadata = {
	title: 'Skriuw',
	description: 'A blazingly fast, privacy-focused note-taking app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="font-sans antialiased dark">
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
