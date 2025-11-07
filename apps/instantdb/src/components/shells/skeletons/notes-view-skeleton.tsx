// Skeleton loader for NotesView that matches the actual UI structure
export function NotesViewSkeleton() {
	return (
		<div
			className="flex h-screen sm:h-screen bg-background"
			style={{ 
				height: 'calc(100vh - env(safe-area-inset-bottom))'
			}}
		>
			{/* File tree sidebar skeleton */}
			<nav
				className="fixed left-0 sm:left-12 flex flex-col justify-start items-center bg-background overflow-y-auto border-r"
				style={{
					width: '210px',
					height: 'calc(100vh - 4.5rem)'
				}}
			>
				{/* Action bar skeleton */}
				<div className="w-full px-2 py-2 border-b border-border">
					<div className="flex items-center justify-between">
						<div className="h-8 w-8 rounded bg-muted animate-pulse" />
						<div className="h-8 w-8 rounded bg-muted animate-pulse" />
					</div>
				</div>

				{/* File tree items skeleton */}
				<div className="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4">
					{/* Folder skeletons */}
					{Array.from({ length: 3 }).map((_, i) => (
						<div
							key={`folder-${i}`}
							className="w-full space-y-1"
							style={{
								animationDelay: `${i * 0.1}s`
							}}
						>
							<div className="flex items-center gap-2 py-1">
								<div className="h-4 w-4 rounded bg-muted animate-pulse" />
								<div className="h-4 w-24 rounded bg-muted animate-pulse" />
							</div>
							{/* Nested items */}
							{i < 2 && (
								<div className="ml-6 space-y-1">
									{Array.from({ length: 2 }).map((_, j) => (
										<div
											key={`file-${i}-${j}`}
											className="flex items-center gap-2 py-1"
										>
											<div className="h-4 w-4 rounded bg-muted/60 animate-pulse" />
											<div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
										</div>
									))}
								</div>
							)}
						</div>
					))}

					{/* File skeletons */}
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={`file-${i}`}
							className="flex items-center gap-2 py-1 w-full"
							style={{
								animationDelay: `${(i + 3) * 0.1}s`
							}}
						>
							<div className="h-4 w-4 rounded bg-muted animate-pulse" />
							<div className="h-4 flex-1 rounded bg-muted animate-pulse" />
						</div>
					))}
				</div>
			</nav>

			{/* Editor area skeleton */}
			<div className="flex-1 relative sm:ml-[220px] ml-0">
				<div className="h-full flex flex-col">
					{/* Editor toolbar skeleton */}
					<div className="h-12 border-b border-border px-4 flex items-center gap-2">
						<div className="h-6 w-32 rounded bg-muted animate-pulse" />
					</div>

					{/* Editor content skeleton */}
					<div className="flex-1 p-8 space-y-4">
						{/* Title skeleton */}
						<div className="h-10 w-3/4 rounded bg-muted animate-pulse" />

						{/* Content lines skeleton */}
						<div className="space-y-3 pt-4">
							{Array.from({ length: 8 }).map((_, i) => {
								// Use deterministic widths based on index to avoid hydration mismatch
								const widths = [85, 92, 75, 93, 81, 94, 88, 98];
								return (
									<span
										key={i}
										className="h-5 rounded bg-muted animate-pulse"
										style={{
											width: `${widths[i]}%`,
											animationDelay: `${i * 0.05}s`
										}}
									/>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

