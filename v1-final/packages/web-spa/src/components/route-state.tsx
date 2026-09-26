import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

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
			<p tabIndex={-1} className="text-sm font-medium">
				This workspace view could not be opened.
			</p>
			<details className="max-w-md text-center">
				<summary className="cursor-pointer text-xs text-muted-foreground">
					Technical details
				</summary>
				<p className="mt-1 break-words text-xs text-muted-foreground">{error.message}</p>
			</details>
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

/**
 * Shown for an unknown route. Keeps the shell chrome (icon rail, settings)
 * intact — only the content frame swaps — and offers a keyboard-reachable way
 * back to the notes workspace.
 */
export function DesktopRouteNotFound() {
	const router = useRouter();
	return (
		<div className="flex min-h-40 flex-col items-center justify-center gap-3 p-6" role="alert">
			<p tabIndex={-1} className="text-sm font-medium">
				That page doesn&apos;t exist.
			</p>
			<button
				type="button"
				onClick={() => router.navigate({ to: "/app" })}
				className="border border-border px-3 py-2 text-sm hover:bg-muted"
			>
				Open notes
			</button>
		</div>
	);
}
