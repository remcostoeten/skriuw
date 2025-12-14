export function IndexSkeleton() {
	return (
		<div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-4 py-8 sm:px-6 sm:py-12 w-full">
			<div className="flex flex-col items-center gap-4 sm:gap-6 mb-6 sm:mb-8 w-full">
				<div className="flex flex-col items-center gap-2 sm:gap-3">
					{/* Logo skeleton */}
					<div className="h-[120px] w-[120px] bg-muted/50 rounded-xl animate-pulse mb-4" />
					{/* Title skeleton */}
					<div className="h-8 sm:h-10 w-24 sm:w-32 bg-muted/50 rounded animate-pulse" />
					{/* Subtitle skeleton */}
					<div className="h-3 sm:h-4 w-48 sm:w-64 bg-muted/50 rounded animate-pulse" />
				</div>
				<div className="max-w-lg w-full space-y-2">
					{/* Description skeletons */}
					<div className="h-3 sm:h-4 w-full bg-muted/50 rounded animate-pulse" />
					<div className="h-3 sm:h-4 w-full bg-muted/50 rounded animate-pulse" />
					<div className="h-3 sm:h-4 w-3/4 bg-muted/50 rounded animate-pulse mx-auto" />
				</div>
			</div>
			{/* Button skeletons - no text, just shapes */}
			<div className="flex flex-col sm:flex-row gap-3 mt-6 w-full sm:w-auto">
				<div className="h-20 w-[140px] bg-muted/50 rounded-lg animate-pulse" />
				<div className="h-20 w-[140px] bg-muted/50 rounded-lg animate-pulse" />
			</div>
		</div>
	)
}
