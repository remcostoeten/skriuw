'use client'

export function IndexSkeleton() {
	return (
		<div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12">
			<div className="flex flex-col items-center gap-6 mb-8">
				<div className="flex flex-col items-center gap-3">
					<div className="h-10 w-32 bg-muted/50 rounded animate-pulse" />
					<div className="h-4 w-64 bg-muted/50 rounded animate-pulse" />
				</div>
				<div className="max-w-lg space-y-2">
					<div className="h-4 w-full bg-muted/50 rounded animate-pulse" />
					<div className="h-4 w-full bg-muted/50 rounded animate-pulse" />
					<div className="h-4 w-3/4 bg-muted/50 rounded animate-pulse" />
				</div>
			</div>
			<div className="flex flex-col items-center gap-3 max-w-sm">
				<div className="flex flex-col items-center gap-2 text-center">
					<p className="text-lg font-medium text-secondary-foreground">Select a note to start editing</p>
					<p className="text-sm text-muted-foreground">Get started by opening a collection or creating a new note</p>
				</div>
				<div className="flex flex-col sm:flex-row gap-3 mt-2">
					<button className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-colors min-w-[140px] text-muted-foreground hover:text-secondary-foreground hover:bg-accent">
						<span className="inline-flex items-center gap-1">
							<kbd className="pointer-events-none inline-flex h-6 min-w-[24px] tracking-wider select-none items-center justify-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-foreground shadow-sm">
								<span>Ctrl</span>
								<span className="text-muted-foreground/60">+</span>
								<span>O</span>
							</kbd>
						</span>
						<span className="text-sm font-medium">Open Collection</span>
					</button>
					<button className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-colors min-w-[140px] text-muted-foreground hover:text-secondary-foreground hover:bg-accent">
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
