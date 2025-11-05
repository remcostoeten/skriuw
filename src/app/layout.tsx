import { AppNavigationSidebar } from '@/components/app-navigation-sidebar'
import { Providers } from '@/components/providers'
import { metadata, viewport } from '@/core/config/metadata'
import { geistSans, geistMono } from '@/core/config/fonts'
import './globals.css'

export { metadata, viewport }

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
			</head>
			<body
				suppressHydrationWarning
				className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
			>
				<AppNavigationSidebar />
				<div className="sm:pl-12 pb-16 sm:pb-0">
					<Providers>{children}</Providers>
				</div>
			</body>
		</html>
	)
}
