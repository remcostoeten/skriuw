'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { EmptyState } from '@/shared/ui/empty-state'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

export default function NotFound() {
	const pathname = usePathname()
	const router = useRouter()

	useEffect(() => {
		console.error(
			'404 Error: User attempted to access non-existent route:',
			pathname
		)
	}, [pathname])

	return (
		<AppLayoutContainer>
			<EmptyState
				message="404 - Page Not Found"
				isFull
				submessage={`The route "${pathname}" does not exist.`}
				actions={[
					{
						label: 'Return to Home',
						onClick: () => router.push('/')
					}
				]}
			/>
		</AppLayoutContainer>
	)
}
