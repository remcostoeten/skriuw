import { ExternalLink, Star, StickyNote } from 'lucide-react'
import { SandboxConfig } from '../types/projects'
import { MotionPanel } from './motion-panel'

export function SandboxFrame({ sandbox }: { sandbox: SandboxConfig }) {
	function renderActionIcon(type: string) {
		if (type === 'source') return <ExternalLink className="h-4 w-4" aria-hidden />
		if (type === 'star') return <Star className="h-4 w-4" aria-hidden />
		return <StickyNote className="h-4 w-4" aria-hidden />
	}

	function renderAction(action: SandboxConfig['actions'][number]) {
		const icon = renderActionIcon(action.type)
		if (action.href) {
			return (
				<a
					key={action.label}
					href={action.href}
					target="_blank"
					rel="noreferrer"
					className="flex items-center gap-2 text-sm text-primary hover:text-foreground transition-colors"
				>
					{icon}
					{action.label}
				</a>
			)
		}
		return (
			<div key={action.label} className="flex items-center gap-2 text-sm text-muted-foreground">
				{icon}
				{action.note}
			</div>
		)
	}

	return (
		<MotionPanel>
			<div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/30 via-background to-muted/10 p-6 space-y-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-xs uppercase tracking-[0.2em] text-primary/70">Sandbox</p>
						<h3 className="text-lg font-semibold text-foreground">{sandbox.variant}</h3>
						<p className="text-muted-foreground text-sm max-w-2xl">{sandbox.description}</p>
					</div>
					<span className="px-3 py-1 rounded-full border border-border/60 text-xs text-muted-foreground/80">Isolated preview</span>
				</div>
				<div className="rounded-xl border border-dashed border-border/50 bg-background/60 p-4 text-muted-foreground text-sm">
					Live components render here without iframes. Interaction stays scoped to preserve page performance.
				</div>
				{sandbox.actions?.length ? (
					<div className="flex flex-wrap gap-3">
						{sandbox.actions.map(renderAction)}
					</div>
				) : null}
			</div>
		</MotionPanel>
	)
}
