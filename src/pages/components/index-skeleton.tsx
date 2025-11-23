import { Skeleton } from '@/shared/ui/skeleton'

/**
 * Skeleton loader for the Index page empty state
 * Maintains exact layout dimensions to prevent layout shift
 */
export function IndexSkeleton() {
	return (
		<div className="flex-1 flex items-center justify-center bg-background">
			<div className="flex flex-col items-center gap-2">
				{/* Icon skeleton */}
				<Skeleton className="h-12 w-12 rounded-full" />

				{/* Message skeleton */}
				<div className="flex flex-col items-center gap-1">
					<Skeleton className="h-6 w-64" />
					<Skeleton className="h-4 w-80" />
				</div>

				{/* Actions skeleton */}
				<div className="flex gap-5 mt-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-8 w-36" />
				</div>
			</div>
		</div>
	)
}

