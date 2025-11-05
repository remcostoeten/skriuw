export function SidebarSkeleton() {
	return (
		<>
			<aside
				className="fixed left-0 top-0 z-50 hidden sm:flex h-screen w-12 flex-col items-center border-r overflow-hidden bg-background"
			>
				<nav
					className="flex flex-col items-center flex-1 w-full overflow-hidden"
					aria-label="Main navigation"
				>
					{/* Logo skeleton */}
					<div className="flex flex-col items-center w-full pt-4 pb-2">
						<div className="h-[35px] w-[35px] rounded-md bg-muted animate-pulse" />
					</div>
					{/* Separator */}
					<div className="w-full h-px bg-border" />
					{/* Navigation icons skeleton */}
					<div className="flex flex-col items-center gap-2 pt-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<div
								key={i}
								className="h-7 w-7 rounded-md bg-muted animate-pulse"
								style={{
									animationDelay: `${i * 0.1}s`
								}}
							/>
						))}
					</div>
				</nav>
				{/* Bottom navigation skeleton */}
				<nav className="flex flex-col items-center gap-2 pb-4">
					{Array.from({ length: 2 }).map((_, i) => (
						<div
							key={i}
							className="h-7 w-7 rounded-md bg-muted animate-pulse"
							style={{
								animationDelay: `${(i + 4) * 0.1}s`
							}}
						/>
					))}
				</nav>
			</aside>

			{/* Mobile bottom navigation skeleton */}
			<nav
				className="fixed bottom-0 left-0 right-0 z-50 flex sm:hidden items-center justify-around border-t py-3 px-4 bg-background"
				style={{
					paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))'
				}}
				aria-label="Mobile navigation"
			>
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						key={i}
						className="h-7 w-7 rounded-md bg-muted animate-pulse"
						style={{
							animationDelay: `${i * 0.1}s`
						}}
					/>
				))}
			</nav>
		</>
	)
}

