import { overviewMetadata } from '@/features/projects/utilities/metadata'
import { ProjectsOverviewView } from '@/features/projects/views/projects-overview'

export const metadata = overviewMetadata()

export default function ProjectsPage() {
	return <ProjectsOverviewView />
}
