import { Project } from '../types/projects'

export function formatRange(project: Project) {
	const formatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })
	const start = formatter.format(new Date(project.dates.start))
	if (!project.dates.end) {
		return start
	}
	const end = formatter.format(new Date(project.dates.end))
	return `${start} — ${end}`
}
