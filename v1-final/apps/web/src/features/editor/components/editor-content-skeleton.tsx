export function EditorContentSkeleton() {
	// Geometry mirrors the BlockNote content box (.blocknote-wrapper px-6 py-3
	// with an inner `.bn-editor { max-width: 42rem; margin: 0 auto }`) so the
	// text doesn't shift horizontally or vertically when the editor resolves.
	// Bars are static (no shimmer) — motion draws the eye and makes the wait
	// feel longer; the root fades in after the appear-delay window.
	return (
		<div className="animate-skeleton-appear px-6 py-3" aria-hidden="true">
			<div className="mx-auto w-full max-w-[42rem] space-y-7">
				<div className="h-7 w-[58%] bg-foreground/[0.06]" />

				<div className="space-y-2.5">
					<div className="h-2.5 w-full bg-foreground/[0.045]" />
					<div className="h-2.5 w-[94%] bg-foreground/[0.045]" />
					<div className="h-2.5 w-[72%] bg-foreground/[0.045]" />
				</div>

				<div className="space-y-2.5">
					<div className="h-2.5 w-[88%] bg-foreground/[0.035]" />
					<div className="h-2.5 w-[54%] bg-foreground/[0.035]" />
				</div>
			</div>
		</div>
	);
}
