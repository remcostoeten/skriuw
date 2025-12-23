import Link from 'next/link'
import { Project } from '../types/projects'
import { ProjectNavigation } from '../components/project-navigation'
import { ProjectHeader } from '../components/project-header'
import { MediaFrame } from '../components/media-frame'
import { SandboxFrame } from '../components/sandbox-frame'
import { GithubPanel } from '../components/github-panel'
import { MotionPanel } from '../components/motion-panel'

export function ProjectDetailView({ project, previous, next }: { project: Project; previous?: Project; next?: Project }) {
	function renderLinks() {
		if (!project.links) return null
		return (
			<div className="flex flex-wrap items-center gap-3 text-sm text-primary">
				{project.links.live ? (
					<Link
						href={project.links.live}
						target="_blank"
						rel="noreferrer"
						className="hover:text-foreground transition-colors"
					>
						Live site
					</Link>
				) : null}
				{project.links.repo ? (
					<Link
						href={project.links.repo}
						target="_blank"
						rel="noreferrer"
						className="hover:text-foreground transition-colors"
					>
						Repository
					</Link>
				) : null}
				{project.links.docs ? (
					<Link
						href={project.links.docs}
						target="_blank"
						rel="noreferrer"
						className="hover:text-foreground transition-colors"
					>
						Documentation
					</Link>
				) : null}
			</div>
		)
	}

	return (
		<section className="mx-auto max-w-5xl w-full px-4 py-10 space-y-8">
			<ProjectNavigation previous={previous} next={next} />
			<ProjectHeader project={project} />
			{renderLinks()}
			{project.media ? <MediaFrame media={project.media} /> : null}
			<div className="grid gap-4 md:grid-cols-2">
				{project.sandbox ? <SandboxFrame sandbox={project.sandbox} /> : null}
				{project.github ? <GithubPanel github={project.github} /> : null}
			</div>
			<MotionPanel>
				<div className="rounded-2xl border border-border/60 bg-muted/10 p-6 space-y-3">
					<h3 className="text-lg font-semibold text-foreground">Execution notes</h3>
					<p className="text-muted-foreground leading-relaxed">
						Each project leans on SSR-first delivery with streaming detail sections so navigation never blocks. Media and GitHub data hydrate progressively, keeping the page interactive even when the network is slow.
					</p>
				</div>
			</MotionPanel>
		</section>
	)
}
