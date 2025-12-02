'use client'

import { Activity, Database, Route as RouteIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

import { cn } from '@/shared/utilities'

type HealthInfo = {
	status: string
	timestamp: string
	environment: {
		nodeEnv?: string
		hasDatabaseUrl?: boolean
		dbModuleAvailable?: boolean
		dbModuleError?: string | null
	}
}

export function DevWidget() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const [isOpen, setIsOpen] = useState(false)
	const [health, setHealth] = useState<HealthInfo | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const fetchHealth = async () => {
		setLoading(true)
		setError(null)
		try {
			const response = await fetch('/api/health')
			if (!response.ok) {
				throw new Error(`Request failed with ${response.status}`)
			}
			const body = (await response.json()) as HealthInfo
			setHealth(body)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (isOpen && !health && !loading) {
			fetchHealth().catch(() => {
				/* handled via state */
			})
		}
	}, [isOpen, health, loading])

	if (!isOpen) {
		return (
			<button
				onClick={() => setIsOpen(true)}
				className={cn(
					'fixed bottom-4 right-4 z-50',
					'w-12 h-12 rounded-full',
					'bg-primary text-primary-foreground',
					'flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-border'
				)}
				title="Open Dev Widget"
			>
				<Activity className="h-5 w-5" />
			</button>
		)
	}

	return (
		<div
			className={cn(
				'fixed bottom-4 right-4 z-50',
				'w-[320px] max-w-[90vw] rounded-xl border border-border bg-background/95 backdrop-blur shadow-xl',
				'flex flex-col'
			)}
		>
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
				<div className="flex items-center gap-2">
					<Activity className="h-4 w-4 text-primary" />
					<div className="text-sm font-semibold text-foreground">Dev Widget</div>
				</div>
				<button
					onClick={() => setIsOpen(false)}
					className="w-6 h-6 grid place-items-center rounded-md hover:bg-muted transition-colors"
					aria-label="Close dev widget"
				>
					<X className="h-4 w-4 text-muted-foreground" />
				</button>
			</div>

			<div className="p-4 space-y-4 max-h-[320px] overflow-y-auto">
				<section className="space-y-1.5">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<RouteIcon className="h-3.5 w-3.5" />
						Route
					</div>
					<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
						<div className="text-sm font-medium text-foreground">{pathname || '/'}</div>
						{searchParams.size > 0 && (
							<div className="text-xs text-muted-foreground mt-1 break-all">
								?{searchParams.toString()}
							</div>
						)}
					</div>
				</section>

				<section className="space-y-1.5">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<Database className="h-3.5 w-3.5" />
						Backend
					</div>
					<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2 text-sm">
						{loading && <div className="text-muted-foreground">Checking API health…</div>}
						{error && <div className="text-destructive">Failed to fetch health: {error}</div>}
						{health && !loading && (
							<>
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Status</span>
									<span
										className={cn(
											'font-medium',
											health.status === 'ok' ? 'text-emerald-500' : 'text-destructive'
										)}
									>
										{health.status}
									</span>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">DB URL set</span>
									<span className="font-medium">
										{health.environment.hasDatabaseUrl ? 'yes' : 'no'}
									</span>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">DB Module</span>
									<span className="font-medium">
										{health.environment.dbModuleAvailable
											? 'loaded'
											: health.environment.dbModuleError || 'unavailable'}
									</span>
								</div>
								<button
									onClick={fetchHealth}
									className="w-full text-xs text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
								>
									Refresh status
								</button>
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}
