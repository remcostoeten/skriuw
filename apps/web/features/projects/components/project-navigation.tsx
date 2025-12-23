import Link from 'next/link'
import { ArrowLeft, ArrowRight, LayoutGrid } from 'lucide-react'
import { Project } from '../types/projects'

export function ProjectNavigation({ previous, next }: { previous?: Project; next?: Project }) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
			<Link
				href="/projects"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg px-2 py-1"
				prefetch
			>
				<LayoutGrid className="h-4 w-4" aria-hidden />
				Back to overview
			</Link>
			<div className="flex items-center gap-3">
				{previous ? (
					<Link
						href={`/projects/${previous.slug}`}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg px-2 py-1"
						prefetch
					>
						<ArrowLeft className="h-4 w-4" aria-hidden />
						{previous.title}
					</Link>
				) : null}
				{next ? (
					<Link
						href={`/projects/${next.slug}`}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg px-2 py-1"
						prefetch
					>
						{next.title}
						<ArrowRight className="h-4 w-4" aria-hidden />
					</Link>
				) : null}
			</div>
		</div>
	)
}
