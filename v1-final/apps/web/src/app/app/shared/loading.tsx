export default function SharedNotesLoading() {
	return (
		<div className="relative flex h-dvh max-h-full min-h-0">
			{/* icon rail placeholder */}
			<div className="hidden w-14 shrink-0 border-r border-sidebar-border bg-sidebar/95 md:block" />
			<main className="flex-1 overflow-hidden">
				<div className="mx-auto w-full max-w-5xl px-6 py-10">
					<div className="h-6 w-40 animate-pulse rounded bg-muted" />
					<div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted/70" />
					<div className="mt-6 flex gap-2">
						{[0, 1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-7 w-16 animate-pulse rounded-full bg-muted/70"
							/>
						))}
					</div>
					<div className="mt-5 overflow-hidden rounded-lg border border-border">
						<div className="h-9 border-b border-border bg-muted/40" />
						{[0, 1, 2, 3, 4].map((i) => (
							<div
								key={i}
								className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
							>
								<div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
								<div className="h-4 flex-1 animate-pulse rounded bg-muted/70" />
								<div className="h-7 w-24 animate-pulse rounded bg-muted/60" />
							</div>
						))}
					</div>
				</div>
			</main>
		</div>
	);
}
