export function ArchivePageSkeleton() {
	return (
		<div className="animate-pulse">
			<div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
			<div className="space-y-4">
				<div className="h-4 bg-muted rounded w-full"></div>
				<div className="h-4 bg-muted rounded w-5/6"></div>
				<div className="h-4 bg-muted rounded w-4/6"></div>
			</div>
		</div>
	)
}
