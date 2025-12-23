import { Project } from '../types/projects'

export function sortProjects(projects: Project[], direction: 'desc' | 'asc') {
	const sorted = [...projects]
	sorted.sort(function compare(a, b) {
		const first = new Date(a.dates.start).getTime()
		const second = new Date(b.dates.start).getTime()
		return direction === 'desc' ? second - first : first - second
	})
	return sorted
}
