import { Project } from '../types/projects'
import { sortProjects } from './sort-projects'

export function findAdjacent(projects: Project[], slug: string) {
	const ordered = sortProjects(projects, 'desc')
	const index = ordered.findIndex(function match(project) {
		return project.slug === slug
	})
	if (index === -1) {
		return { previous: undefined, next: undefined }
	}
	const previous = index > 0 ? ordered[index - 1] : undefined
	const next = index < ordered.length - 1 ? ordered[index + 1] : undefined
	return { previous, next }
}
