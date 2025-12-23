import { StatusBadge } from './status-badge'
import { CategoryPill } from './category-pill'
import { StackPill } from './stack-pill'
import { formatRange } from '../utilities/format-date'
import { Project } from '../types/projects'

export function ProjectHeader({ project }: { project: Project }) {
	function renderCategory(label: string) {
		return <CategoryPill key={label} label={label} />
	}

	function renderStack(label: string) {
		return <StackPill key={label} label={label} />
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-3">
					<div className="flex items-center gap-3 flex-wrap">
						<StatusBadge status={project.status} />
						<span className="text-sm text-muted-foreground">{formatRange(project)}</span>
					</div>
					<h1 className="text-3xl font-semibold text-foreground leading-tight">{project.title}</h1>
					<p className="text-muted-foreground text-base max-w-3xl leading-relaxed">
						{project.description}
					</p>
				</div>
				<div className="flex flex-wrap gap-2 justify-start sm:justify-end" aria-label="Categories">
					{project.categories.map(renderCategory)}
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2" aria-label="Tech stack">
				{project.stack.map(renderStack)}
			</div>
		</div>
	)
}
