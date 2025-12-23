export function CategoryPill({ label }: { label: string }) {
	return (
		<span className="px-3 py-1 rounded-full bg-primary/5 text-primary text-xs border border-primary/10 whitespace-nowrap">
			{label}
		</span>
	)
}
