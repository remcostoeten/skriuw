import { Project } from '../types/projects'

export function filterProjects(projects: Project[], status?: string, category?: string, year?: string) {
	return projects.filter(function filter(project) {
		const matchesStatus = !status || status === 'all' ? true : project.status === status
		const matchesCategory = !category || category === 'all' ? true : project.categories.includes(category)
		const projectYear = new Date(project.dates.start).getFullYear().toString()
		const matchesYear = !year || year === 'all' ? true : projectYear === year
		return matchesStatus && matchesCategory && matchesYear
	})
}
