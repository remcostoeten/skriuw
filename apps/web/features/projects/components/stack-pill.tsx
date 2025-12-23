export function StackPill({ label }: { label: string }) {
	return (
		<span className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground whitespace-nowrap border border-border">
			{label}
		</span>
	)
}
