'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { EmptyState } from '../components/ui/empty-state'

// Force this page to be dynamically rendered
export const dynamic = 'force-dynamic'

export default function NotFound() {
	const pathname = usePathname()
	const router = useRouter()

	useEffect(() => {
		console.error('404 Error: User attempted to access non-existent route:', pathname)
	}, [pathname])

	return (
		<EmptyState
			message="404 - Page Not Found"
			isFull
			isError={`The route "${pathname}" does not exist.`}
			actions={[
				{
					label: 'Return to Home',
					onClick: () => router.push('/'),
				},
			]}
		/>
	)
}
