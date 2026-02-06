'use client'

import { EmptyState } from '@skriuw/ui'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export const dynamic = 'force-dynamic'

export default function NotFound() {
	const pathname = usePathname()
	const router = useRouter()

	useEffect(() => {
		console.error('404 Error: User attempted to access non-existent route:', pathname)
	}, [pathname])

	return (
		<EmptyState
			message='404 - Page Not Found'
			isFull
			isError
			description={`The route "${pathname}" does not exist.`}
			actions={[
				{
					label: 'Return to Home',
					onClick: () => router.push('/')
				}
			]}
		/>
	)
}
