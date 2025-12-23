import { notFound } from 'next/navigation'
import { projectMetadata, projectJsonLd } from '@/features/projects/utilities/metadata'
import { getProject, getProjects } from '@/features/projects/api/queries/project-registry'
import { findAdjacent } from '@/features/projects/utilities/find-adjacent'
import { ProjectDetailView } from '@/features/projects/views/project-detail'

export type Props = {
	params: { slug: string }
}

export function generateMetadata({ params }: Props) {
	const project = getProject(params.slug)
	if (!project) {
		return {}
	}
	return projectMetadata(project)
}

export function generateStaticParams() {
	const projects = getProjects()
	return projects.map(function map(project) {
		return { slug: project.slug }
	})
}

export default function ProjectPage({ params }: Props) {
	const project = getProject(params.slug)
	if (!project) {
		notFound()
	}
	const adjacent = findAdjacent(getProjects(), project.slug)
	const jsonLd = projectJsonLd(project)

	return (
		<>
			<ProjectDetailView project={project} previous={adjacent.previous} next={adjacent.next} />
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
		</>
	)
}
