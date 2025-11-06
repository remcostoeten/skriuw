import type { Metadata, Viewport } from 'next'

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