'use client'

import { cn } from '@skriuw/shared'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
	{ href: '/dev/demo', label: 'Demo' },
	{ href: '/dev/demo/logo', label: 'Logo' },
	{ href: '/dev/demo/notify', label: 'Notify' },
	{ href: '/dev/activity', label: 'Activity' }
]

export default function DevLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname()

	return (
		<div className='min-h-screen bg-background'>
			<nav className='border-b'>
				<div className='container mx-auto px-4 py-4'>
					<div className='flex items-center gap-6'>
						<span className='font-semibold text-lg'>Dev</span>
						<div className='flex gap-4'>
							{navItems.map((item) => (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										'text-sm transition-colors hover:text-foreground',
										pathname === item.href
											? 'text-foreground font-medium'
											: 'text-muted-foreground'
									)}
								>
									{item.label}
								</Link>
							))}
						</div>
					</div>
				</div>
			</nav>
			<main className='container mx-auto px-4 py-8'>{children}</main>
		</div>
	)
}
