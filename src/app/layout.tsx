import { AppNavigationSidebar } from '@/components/app-navigation-sidebar'
import { Providers } from '@/components/providers'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { ThemeToggle } from '@/components/theme/theme-toggle'

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin']
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin']
})

export const metadata: Metadata = {
	metadataBase: new URL('http://localhost:42069'),
	title: 'Notys - Manage your mess, with speed',
	description:
		'A powerful note-taking and task management app that helps you organize your thoughts and boost productivity.',
	keywords: [
		'notes',
		'task management',
		'productivity',
		'organization',
		'notys'
	],
	authors: [{ name: 'Notys Team' }],
	applicationName: 'Notys',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Notys'
	},
	formatDetection: {
		telephone: false
	},
	openGraph: {
		title: 'Notys - Manage your mess, with speed',
		description:
			'A powerful note-taking and task management app that helps you organize your thoughts and boost productivity.',
		type: 'website',
		locale: 'en_US',
		siteName: 'Notys',
		images: [
			{
				url: '/android-chrome-512x512.png',
				width: 512,
				height: 512,
				alt: 'Notys Logo'
			}
		]
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Notys - Manage your mess, with speed',
		description:
			'A powerful note-taking and task management app that helps you organize your thoughts and boost productivity.',
		images: ['/android-chrome-512x512.png']
	},
	icons: {
		icon: [
			{ url: '/favicon.ico', sizes: 'any' },
			{ url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
			{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
			{
				url: '/android-chrome-192x192.png',
				sizes: '192x192',
				type: 'image/png'
			},
			{
				url: '/android-chrome-512x512.png',
				sizes: '512x512',
				type: 'image/png'
			}
		],
		apple: [
			{
				url: '/apple-touch-icon.png',
				sizes: '180x180',
				type: 'image/png'
			}
		],
		other: [
			{
				rel: 'mask-icon',
				url: '/android-chrome-512x512.png'
			}
		]
	},
	manifest: '/manifest.json'
}

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	themeColor: [
		{ media: '(prefers-color-scheme: dark)', color: '#111827' },
		{ media: '(prefers-color-scheme: light)', color: '#ffffff' }
	]
}

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta name="msapplication-TileColor" content="#111827" />
				<meta
					name="msapplication-config"
					content="/browserconfig.xml"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-640x1136.png"
					media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-750x1334.png"
					media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-828x1792.png"
					media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-1125x2436.png"
					media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-1242x2208.png"
					media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-1242x2688.png"
					media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-1536x2048.png"
					media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-1668x2224.png"
					media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-1668x2388.png"
					media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)"
				/>
				<link
					rel="apple-touch-startup-image"
					href="/apple-splash-2048x2732.png"
					media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
				/>
				{/* Set initial theme before hydration to avoid flashes */}
				<script dangerouslySetInnerHTML={{
					__html: `(() => { try { const s = localStorage.getItem('theme'); const m = window.matchMedia('(prefers-color-scheme: dark)').matches; const t = s || (m ? 'dark' : 'light'); const r = document.documentElement; r.classList.remove('light','dark'); r.classList.add(t);} catch (e) {} })();`
				}} />
			</head>
			<body
				suppressHydrationWarning
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<AppNavigationSidebar />
				<div className="sm:pl-12 pb-16 sm:pb-0">
					<nav className="bg-background text-foreground p-4 border-b border-border">
						<div className="max-w-7xl mx-auto flex justify-between items-center">
							<h1 className="text-xl font-bold">InstantDB Notes</h1>
							<div className="flex items-center gap-4">
								<Link href="/">Notes</Link>
								<Link
									href="/platform-demo"
									className="hover:text-blue-400 transition-colors"
								>
									Platform Demo
								</Link>
								<Link
									href="/tasks"
									className="hover:text-blue-400 transition-colors"
								>
									Tasks
								</Link>
								<ThemeToggle />
							</div>
						</div>
					</nav>
					<Providers>{children}</Providers>
				</div>
			</body>
		</html>
	)
}
