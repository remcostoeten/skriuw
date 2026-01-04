import { RawLogo } from '@/components/logo/raw-logo'
import { BrandLogo } from '@/components/logo/brand-logo'
import { NavigationLogo } from '@/components/logo/navigation-logo'
import { CopyButton } from '@/components/ui/copy-button'
import Image from 'next/image'

export default function LogoDemoPage() {
	const rawLogoComponent = `import * as React from 'react'
import { cn } from '@skriuw/shared'

interface RawLogoProps extends React.SVGProps<SVGSVGElement> {
    size?: number
    variant?: 'sidebar' | 'explanation'
    className?: string
}

export function RawLogo({
    size = 120,
    variant = 'explanation',
    className,
    ...props
}: RawLogoProps) {
    const isSidebar = variant === 'sidebar'

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={isSidebar ? "0 0 40 40" : "0 0 390 513"}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
            className={cn('text-foreground', className)}
            {...props}
        >
            <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
                    <stop offset="50%" stopColor="currentColor" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <g fill="url(#logoGradient)" filter="url(#glow)">
                {isSidebar ? (
                    <>
                        <rect x="4" y="8" width="8" height="24" rx="1" />
                        <rect x="16" y="4" width="8" height="32" rx="1" />
                        <rect x="28" y="12" width="8" height="16" rx="1" />
                    </>
                ) : (
                    <>
                        <path
                            d="M6 52 L0 58 L0 391 L8 400 L82 440 L89 441 L94 439 L99 432 L99 104 L94 96 L14 52 Z"
                        />
                        <path
                            d="M133 0 L123 8 L123 504 L130 511 L140 512 L237 463 L246 452 L246 64 L234 52 L150 6 Z"
                        />
                        <path
                            d="M277 78 L272 83 L272 434 L278 440 L288 440 L378 391 L390 380 L390 139 L379 128 L299 78 Z"
                        />
                    </>
                )}
            </g>
        </svg>
    )
}`

	const brandLogoComponent = `import * as React from 'react'
import { motion, SVGMotionProps } from 'framer-motion'
import { RawLogo } from './raw-logo'

interface BrandLogoProps extends SVGMotionProps<SVGSVGElement> {
    size?: number
    animated?: boolean
    className?: string
    variant?: 'sidebar' | 'explanation'
}

export function BrandLogo({
    size = 120,
    animated = true,
    className,
    variant = 'explanation',
    ...props
}: BrandLogoProps) {
    // Component implementation with particle effects
    // See full component in: /components/logo/brand-logo.tsx
}`

	const navigationLogoComponent = `import { motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { RawLogo } from './raw-logo'

export function NavigationLogo() {
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

	// Component implementation with Link wrapper
    // See full component in: /components/logo/navigation-logo.tsx
}`

	const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="120" height="120" preserveAspectRatio="xMidYMid meet">
    <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.8" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
        <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    </defs>
    <g fill="url(#logoGradient)" filter="url(#glow)">
        <rect x="4" y="8" width="8" height="24" rx="1" />
        <rect x="16" y="4" width="8" height="32" rx="1" />
        <rect x="28" y="12" width="8" height="16" rx="1" />
    </g>
</svg>`

	const appIcons = [
		{ name: 'Favicon', path: '/favicon.ico', size: '16x16' },
		{ name: 'Favicon SVG', path: '/favicon.svg', size: 'SVG' },
		{
			name: 'Apple Touch Icon',
			path: '/apple-touch-icon.png',
			size: '180x180'
		},
		{
			name: 'Android Chrome 192x192',
			path: '/android-chrome-192x192.png',
			size: '192x192'
		},
		{
			name: 'Android Chrome 512x512',
			path: '/android-chrome-512x512.png',
			size: '512x512'
		},
		{ name: 'Tauri Icon', path: '/icons/icon.png', size: '512x512' },
		{
			name: 'Windows Store Logo',
			path: '/icons/StoreLogo.png',
			size: '150x150'
		},
		{
			name: 'iOS App Icon 20x20',
			path: '/icons/ios/AppIcon-20x20@1x.png',
			size: '20x20'
		},
		{
			name: 'iOS App Icon 29x29',
			path: '/icons/ios/AppIcon-29x29@1x.png',
			size: '29x29'
		},
		{
			name: 'Android Launcher HDPI',
			path: '/icons/android/mipmap-hdpi/ic_launcher.png',
			size: '72x72'
		},
		{
			name: 'Android Launcher XHDPI',
			path: '/icons/android/mipmap-xhdpi/ic_launcher.png',
			size: '96x96'
		},
		{
			name: 'Android Launcher XXHDPI',
			path: '/icons/android/mipmap-xxhdpi/ic_launcher.png',
			size: '144x144'
		}
	]

	return (
		<div className="container mx-auto py-8 px-4">
			<h1 className="text-3xl font-bold mb-8">
				Logo Component Variants & Assets
			</h1>

			<div className="space-y-12">
				{/* RawLogo Section */}
				<div className="border rounded-lg p-6 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-2xl font-semibold text-blue-600">
							RawLogo
						</h2>
						<div className="flex gap-2">
							<CopyButton
								text={rawLogoComponent}
								label="Copy Component"
							/>
							<CopyButton text="RawLogo" label="Copy Name" />
							<CopyButton
								text="@/components/logo/raw-logo"
								label="Copy Path"
							/>
							<CopyButton text={rawSvg} label="Copy Raw SVG" />
						</div>
					</div>
					<p className="text-muted-foreground">
						Base SVG component with no animations
					</p>

					<div className="flex flex-wrap gap-8 items-center">
						<div className="text-center">
							<div className="mb-2">
								<RawLogo size={60} variant="sidebar" />
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;RawLogo size={60} variant="sidebar" /&gt;
							</code>
						</div>

						<div className="text-center">
							<div className="mb-2">
								<RawLogo size={120} variant="explanation" />
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;RawLogo size={120} variant="explanation"
								/&gt;
							</code>
						</div>

						<div className="text-center">
							<div className="mb-2">
								<RawLogo
									size={80}
									variant="sidebar"
									className="text-blue-500"
								/>
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;RawLogo size={80} variant="sidebar"
								className="text-blue-500" /&gt;
							</code>
						</div>
					</div>
				</div>

				{/* BrandLogo Section */}
				<div className="border rounded-lg p-6 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-2xl font-semibold text-purple-600">
							BrandLogo
						</h2>
						<div className="flex gap-2">
							<CopyButton
								text={brandLogoComponent}
								label="Copy Component"
							/>
							<CopyButton text="BrandLogo" label="Copy Name" />
							<CopyButton
								text="@/components/logo/brand-logo"
								label="Copy Path"
							/>
						</div>
					</div>
					<p className="text-muted-foreground">
						Animated brand logo with particle effects and complex
						animations
					</p>

					<div className="flex flex-wrap gap-8 items-center">
						<div className="text-center">
							<div className="mb-2">
								<BrandLogo size={60} variant="sidebar" />
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;BrandLogo size={60} variant="sidebar" /&gt;
							</code>
						</div>

						<div className="text-center">
							<div className="mb-2">
								<BrandLogo size={120} variant="explanation" />
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;BrandLogo size={120} variant="explanation"
								/&gt;
							</code>
						</div>

						<div className="text-center">
							<div className="mb-2">
								<BrandLogo
									size={100}
									variant="sidebar"
									animated={false}
								/>
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;BrandLogo size={100} variant="sidebar"
								animated={false} /&gt;
							</code>
						</div>
					</div>
				</div>

				{/* NavigationLogo Section */}
				<div className="border rounded-lg p-6 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-2xl font-semibold text-green-600">
							NavigationLogo
						</h2>
						<div className="flex gap-2">
							<CopyButton
								text={navigationLogoComponent}
								label="Copy Component"
							/>
							<CopyButton
								text="NavigationLogo"
								label="Copy Name"
							/>
							<CopyButton
								text="@/components/logo/navigation-logo"
								label="Copy Path"
							/>
						</div>
					</div>
					<p className="text-muted-foreground">
						Navigation logo with link wrapper and fade-in animations
					</p>

					<div className="flex flex-wrap gap-8 items-center">
						<div className="text-center">
							<div className="mb-2">
								<NavigationLogo />
							</div>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								&lt;NavigationLogo /&gt;
							</code>
						</div>
					</div>
				</div>

				{/* App Icons Section */}
				<div className="border rounded-lg p-6 space-y-4">
					<h2 className="text-2xl font-semibold text-orange-600">
						App Icons & Assets
					</h2>
					<p className="text-muted-foreground">
						Complete collection of app icons for all platforms
						(Tauri, iOS, Android, Web)
					</p>

					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{appIcons.map((icon) => (
							<div
								key={icon.name}
								className="border rounded-lg p-4 space-y-2"
							>
								<div className="flex items-center justify-center h-16 w-16 mx-auto bg-muted rounded">
									<Image
										src={icon.path}
										alt={icon.name}
										width={64}
										height={64}
										className="max-h-full max-w-full object-contain"
									/>
								</div>
								<div className="text-center">
									<h3 className="font-medium text-sm">
										{icon.name}
									</h3>
									<p className="text-xs text-muted-foreground">
										{icon.size}
									</p>
									<p className="text-xs font-mono text-muted-foreground truncate">
										{icon.path}
									</p>
								</div>
								<div className="flex gap-1 justify-center">
									<CopyButton
										text={icon.path}
										label="Path"
										className="text-xs px-2 py-1"
									/>
									<CopyButton
										text={`<img src="${icon.path}" alt="${icon.name}" />`}
										label="HTML"
										className="text-xs px-2 py-1"
									/>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Usage Examples */}
				<div className="border rounded-lg p-6 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-2xl font-semibold text-red-600">
							Import Examples
						</h2>
						<CopyButton
							text={`import { RawLogo, BrandLogo, NavigationLogo } from '@/components/logo'`}
							label="Copy Bundle Import"
						/>
					</div>
					<div className="space-y-4">
						<div>
							<h3 className="font-semibold mb-2">
								Individual imports:
							</h3>
							<div className="relative">
								<pre className="bg-muted p-4 rounded text-sm">
									{`import { RawLogo } from '@/components/logo/raw-logo'
import { BrandLogo } from '@/components/logo/brand-logo'
import { NavigationLogo } from '@/components/logo/navigation-logo'`}
								</pre>
								<CopyButton
									text={`import { RawLogo } from '@/components/logo/raw-logo'
import { BrandLogo } from '@/components/logo/brand-logo'
import { NavigationLogo } from '@/components/logo/navigation-logo'`}
									label="Copy"
									className="absolute top-2 right-2"
								/>
							</div>
						</div>

						<div>
							<h3 className="font-semibold mb-2">
								Bundle import:
							</h3>
							<div className="relative">
								<pre className="bg-muted p-4 rounded text-sm">
									{`import { RawLogo, BrandLogo, NavigationLogo } from '@/components/logo'`}
								</pre>
								<CopyButton
									text={`import { RawLogo, BrandLogo, NavigationLogo } from '@/components/logo'`}
									label="Copy"
									className="absolute top-2 right-2"
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Component Props */}
				<div className="border rounded-lg p-6 space-y-4">
					<h2 className="text-2xl font-semibold text-red-600">
						Component Props
					</h2>
					<div className="grid md:grid-cols-2 gap-6">
						<div>
							<h3 className="font-semibold mb-2">RawLogo</h3>
							<ul className="text-sm space-y-1 text-muted-foreground">
								<li>• size?: number (default: 120)</li>
								<li>
									• variant?: 'sidebar' | 'explanation'
									(default: 'explanation')
								</li>
								<li>• className?: string</li>
								<li>
									• ...React.SVGProps&lt;SVGSVGElement&gt;
								</li>
							</ul>
						</div>

						<div>
							<h3 className="font-semibold mb-2">BrandLogo</h3>
							<ul className="text-sm space-y-1 text-muted-foreground">
								<li>• size?: number (default: 120)</li>
								<li>
									• variant?: 'sidebar' | 'explanation'
									(default: 'explanation')
								</li>
								<li>• animated?: boolean (default: true)</li>
								<li>• className?: string</li>
								<li>
									• ...SVGMotionProps&lt;SVGSVGElement&gt;
								</li>
							</ul>
						</div>

						<div>
							<h3 className="font-semibold mb-2">
								NavigationLogo
							</h3>
							<ul className="text-sm space-y-1 text-muted-foreground">
								<li>• No props required</li>
								<li>• Fixed size (h-7 w-7)</li>
								<li>• Includes Next.js Link wrapper</li>
								<li>• Auto-handles client-side mounting</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
