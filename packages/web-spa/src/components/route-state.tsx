import type { ErrorComponentProps } from "@tanstack/react-router";

export function DesktopRouteLoading() {
	return (
		<div
			className="flex min-h-40 items-center justify-center p-6"
			role="status"
			aria-live="polite"
		>
			<p className="text-sm text-muted-foreground">Loading workspace…</p>
		</div>
	);
}

export function DesktopRouteError({ error, reset }: ErrorComponentProps) {
	return (
		<div className="flex min-h-40 flex-col items-center justify-center gap-3 p-6" role="alert">
			<p className="text-sm font-medium">This workspace view could not be opened.</p>
			<p className="max-w-md text-center text-xs text-muted-foreground">{error.message}</p>
			<button
				type="button"
				onClick={reset}
				className="border border-border px-3 py-2 text-sm hover:bg-muted"
			>
				Try again
			</button>
		</div>
	);
}
