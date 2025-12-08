export function IndexSkeleton() {
	return (
		<div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-4 py-8 sm:px-6 sm:py-12 w-full">
			<div className="flex flex-col items-center gap-4 sm:gap-6 mb-6 sm:mb-8 w-full">
				<div className="flex flex-col items-center gap-2 sm:gap-3">
					<div className="h-8 sm:h-10 w-24 sm:w-32 bg-muted/50 rounded animate-pulse" />
					<div className="h-3 sm:h-4 w-48 sm:w-64 bg-muted/50 rounded animate-pulse" />
				</div>
				<div className="max-w-lg w-full space-y-2">
					<div className="h-3 sm:h-4 w-full bg-muted/50 rounded animate-pulse" />
					<div className="h-3 sm:h-4 w-full bg-muted/50 rounded animate-pulse" />
					<div className="h-3 sm:h-4 w-3/4 bg-muted/50 rounded animate-pulse mx-auto" />
				</div>
			</div>
			<div className="flex flex-col items-center gap-3 max-w-sm w-full">
				<div className="flex flex-col items-center gap-2 text-center">
					<p className="text-base sm:text-lg font-medium text-secondary-foreground">
						Select a note to start editing
					</p>
					<p className="text-xs sm:text-sm text-muted-foreground">
						Get started by opening a collection or creating a new note
					</p>
				</div>
				<div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
					<button className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-colors w-full sm:w-auto sm:min-w-[140px] text-muted-foreground hover:text-secondary-foreground hover:bg-accent border border-transparent hover:border-border/50">
						<span className="inline-flex items-center gap-1">
							<kbd className="pointer-events-none inline-flex h-6 min-w-[24px] tracking-wider select-none items-center justify-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-sm">
								<span>Ctrl</span>
								<span className="text-muted-foreground/60">+</span>
								<span>O</span>
							</kbd>
						</span>
						<span className="text-sm font-medium">Open Collection</span>
					</button>
					<button className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-colors w-full sm:w-auto sm:min-w-[140px] text-muted-foreground hover:text-secondary-foreground hover:bg-accent border border-transparent hover:border-border/50">
						<span className="inline-flex items-center gap-1">
							<kbd className="pointer-events-none inline-flex h-6 min-w-[24px] tracking-wider select-none items-center justify-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-sm">
								<span>Ctrl</span>
								<span className="text-muted-foreground/60">+</span>
								<span>N</span>
							</kbd>
						</span>
						<span className="text-sm font-medium">Create Note</span>
					</button>
				</div>
			</div>
		</div>
	)
}
