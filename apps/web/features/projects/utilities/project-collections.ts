import { Project } from '../types/projects'

export function getYears(projects: Project[]) {
	const years = new Set<string>()
	projects.forEach(function add(project) {
		years.add(new Date(project.dates.start).getFullYear().toString())
	})
	return Array.from(years).sort(function compare(a, b) {
		return Number(b) - Number(a)
	})
}

export function getCategories(projects: Project[]) {
	const categories = new Set<string>()
	projects.forEach(function add(project) {
		project.categories.forEach(function collect(category) {
			categories.add(category)
		})
	})
	return Array.from(categories).sort()
}
