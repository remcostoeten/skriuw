import { OverviewShell } from '../components/overview-shell'
import { getProjects } from '../api/queries/project-registry'
import { sortProjects } from '../utilities/sort-projects'
import { getCategories, getYears } from '../utilities/project-collections'

export function ProjectsOverviewView() {
	const projects = getProjects()
	const sorted = sortProjects(projects, 'desc')
	const categories = getCategories(projects)
	const years = getYears(projects)

	return (
		<section className="mx-auto max-w-6xl w-full px-4 py-10 space-y-6">
			<div className="space-y-3">
				<p className="text-xs uppercase tracking-[0.2em] text-primary/70">Projects</p>
				<h1 className="text-3xl font-semibold text-foreground">Premium builds, tuned for resilience</h1>
				<p className="text-muted-foreground max-w-3xl">
					Server-driven experiences that stay instant on weak networks. Explore systems built around deterministic data, fluid editors, and real-time collaboration.
				</p>
			</div>
			<OverviewShell projects={sorted} categories={categories} years={years} />
		</section>
	)
}
