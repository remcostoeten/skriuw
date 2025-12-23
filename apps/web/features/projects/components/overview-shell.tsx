'use client'

import { Project } from '../types/projects'
import { useProjectFilters } from '../hooks/use-project-filters'
import { FilterBar } from './filter-bar'
import { ProjectCard } from './project-card'
import { MotionPanel } from './motion-panel'

export function OverviewShell({ projects, categories, years }: { projects: Project[]; categories: string[]; years: string[] }) {
	const statuses = ['all', 'finished', 'in-progress', 'abandoned']
	const { items, filters, setStatus, setCategory, setYear, setSort, pending } = useProjectFilters(projects)

	function renderCard(project: Project, index: number) {
		return <ProjectCard key={project.slug} project={project} index={index} />
	}

	return (
		<div className="space-y-6">
			<FilterBar
				statuses={statuses}
				categories={categories}
				years={years}
				filters={filters}
				onStatus={setStatus}
				onCategory={setCategory}
				onYear={setYear}
				onSort={setSort}
				pending={pending}
			/>
			{items.length === 0 ? (
				<MotionPanel>
					<div className="border border-border/60 rounded-xl p-8 text-center text-muted-foreground bg-muted/10">
						No projects match these filters yet.
					</div>
				</MotionPanel>
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{items.map(renderCard)}
				</div>
			)}
		</div>
	)
}
